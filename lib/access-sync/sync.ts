import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { projectAccess, projectIntegrations, projects, type ProjectAccessRow } from "@/db/schema";
import { getAdminEmails } from "@/lib/access/admins";
import { adsConfigured } from "@/lib/google/ads";
import { serviceAccount, workspaceUser } from "@/lib/google/auth";
import { addLog, condition } from "@/lib/log/store";
import { createTask } from "@/lib/tasks/store";
import { ga4PropertyId, gtmIds } from "./parse";
import * as api from "./services";

/**
 * Keeps the project's specialists' accesses in line with who is assigned in «Вводные»:
 * the assigned MediaBuyer / SMM get access to the project's services, a replaced one loses what the dashboard gave.
 * Services without an API for this (Clarity, Search Console, Telegram) become tasks for the admin.
 */

export const SERVICE_LABEL: Record<string, string> = {
  drive: "Папка Drive",
  google_ads: "Google Ads",
  ga4: "Google Analytics 4",
  gtm: "Google Tag Manager",
  meta: "Meta Ads",
  clarity: "Clarity",
  search_console: "Search Console",
  telegram: "Telegram-чат",
};

type Role = "media_buyer" | "smm";
interface Want {
  service: string;
  target: string;
  email: string;
  role: Role;
  /** Human link for task-based services. */
  link?: string;
}

const ACTIVE = ["granted", "existing", "task"];

async function desired(projectId: string): Promise<{ wants: Want[]; name: string }> {
  const db = getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (!p || p.status === "archived") return { wants: [], name: p?.name ?? projectId };
  const [drive] = await db
    .select({ config: projectIntegrations.config })
    .from(projectIntegrations)
    .where(and(eq(projectIntegrations.projectId, projectId), eq(projectIntegrations.kind, "drive")))
    .limit(1);
  const folderId = (drive?.config as { folderId?: string } | undefined)?.folderId;
  const sv = p.services ?? {};
  const ga4 = ga4PropertyId(sv.ga4);
  const gtm = gtmIds(sv.gtm);
  const google = p.sources.filter((s) => s.platform === "google" && s.accountId).map((s) => s.accountId.replace(/\D/g, ""));
  const metaAcc = p.sources.filter((s) => s.platform === "meta" && s.accountId).map((s) => s.accountId.replace(/\D/g, ""));

  const wants: Want[] = [];
  const people: [string | null, Role][] = [
    [p.mediaBuyerEmail, "media_buyer"],
    [p.smmEmail, "smm"],
  ];
  for (const [email, role] of people) {
    if (!email) continue;
    const add = (service: string, target: string, link?: string) => {
      // One person in both roles gets the stronger (MediaBuyer) access once.
      if (!wants.some((w) => w.service === service && w.target === target && w.email === email)) wants.push({ service, target, email, role, link });
    };
    if (folderId) add("drive", folderId);
    if (p.telegramChatId) add("telegram", p.telegramChatId);
    if (ga4) add("ga4", ga4);
    for (const a of metaAcc) add("meta", a);
    if (role === "media_buyer") {
      for (const g of google) add("google_ads", g);
      if (gtm) add("gtm", `${gtm.accountId}/${gtm.containerId}`);
      if (sv.clarity) add("clarity", sv.clarity, sv.clarity);
      if (sv.searchConsole) add("search_console", sv.searchConsole, sv.searchConsole);
    }
  }
  return { wants, name: p.name };
}

/** Why a service cannot be handled automatically right now (null = it can). */
function notReady(service: string): string | null {
  const google = serviceAccount() ? null : "сервис-аккаунт Google не настроен";
  switch (service) {
    case "drive":
      return google;
    case "google_ads":
      return adsConfigured() ? null : "Google Ads API не настроен";
    case "ga4":
    case "gtm":
      return google ?? (workspaceUser() ? null : "нет GOOGLE_WORKSPACE_USER");
    case "meta":
      return api.metaAccessConfigured() ? null : "Meta ещё не подключена (нужны META_SYSTEM_USER_TOKEN и META_BUSINESS_ID)";
    default:
      return null;
  }
}

const TASK_SERVICES = new Set(["clarity", "search_console", "telegram"]);

async function grant(w: Want, projectName: string, projectId: string, actor: string): Promise<{ status: string; ref: string | null }> {
  const label = SERVICE_LABEL[w.service];
  if (TASK_SERVICES.has(w.service)) {
    const taskId = await createTask(
      {
        title: `Выдать доступ: ${label} → ${w.email}`,
        description: `Проект «${projectName}». ${w.service === "telegram" ? `Добавьте ${w.email} в чат проекта (ID ${w.target}) или отправьте ему ссылку-приглашение.` : `Откройте ${w.link ?? label} → Настройки → Пользователи → добавьте ${w.email}.`} Автоматически это сделать нельзя: у сервиса нет такого API.`,
        projectId,
        assigneeEmail: getAdminEmails()[0] ?? null,
        deadline: null,
        stage: "todo",
      },
      actor,
    );
    return { status: "task", ref: taskId };
  }
  const editor = w.role === "media_buyer";
  const [a, b] = w.target.split("/");
  const r =
    w.service === "drive"
      ? await api.grantDrive(w.target, w.email)
      : w.service === "google_ads"
        ? await api.grantGoogleAds(w.target, w.email)
        : w.service === "ga4"
          ? await api.grantGa4(w.target, w.email, editor ? "editor" : "viewer")
          : w.service === "gtm"
            ? await api.grantGtm(a, b, w.email, editor ? "publish" : "read")
            : await api.grantMeta(w.target, w.email, editor ? ["ANALYZE", "ADVERTISE"] : ["ANALYZE"]);
  return r.existing ? { status: "existing", ref: null } : { status: "granted", ref: r.ref };
}

async function revoke(row: ProjectAccessRow, projectName: string, actor: string): Promise<string> {
  const label = SERVICE_LABEL[row.service];
  if (row.status === "task" || TASK_SERVICES.has(row.service)) {
    await createTask(
      {
        title: `Забрать доступ: ${label} → ${row.email}`,
        description: `Проект «${projectName}»: ${row.email} больше не ведёт проект. Уберите его из ${label}${row.service === "telegram" ? ` (чат ${row.target})` : ` (${row.target})`}.`,
        projectId: row.projectId,
        assigneeEmail: getAdminEmails()[0] ?? null,
        deadline: null,
        stage: "todo",
      },
      actor,
    );
    return "revoke_task";
  }
  const [a] = row.target.split("/");
  if (row.service === "drive") await api.revokeDrive(row.target, row.ref ?? "");
  else if (row.service === "google_ads") await api.revokeGoogleAds(row.target, row.email, row.ref ?? "");
  else if (row.service === "ga4") await api.revokeGa4(row.ref ?? "");
  else if (row.service === "gtm") await api.revokeGtm(row.ref ?? "");
  else if (row.service === "meta") await api.revokeMeta(a, row.ref ?? "");
  return "revoked";
}

export async function syncProjectAccess(projectId: string, actor = "дашборд") {
  const db = getDb();
  const { wants, name } = await desired(projectId);
  const rows = await db.select().from(projectAccess).where(eq(projectAccess.projectId, projectId));
  const key = (s: string, t: string, e: string) => `${s}|${t}|${e}`;
  const wanted = new Set(wants.map((w) => key(w.service, w.target, w.email)));
  const done: string[] = [];
  const problems: string[] = [];

  // Take back what the dashboard gave to people who are no longer on the project (or from a replaced resource).
  for (const row of rows.filter((r) => ["granted", "task"].includes(r.status) && !wanted.has(key(r.service, r.target, r.email)))) {
    try {
      const status = await revoke(row, name, actor);
      await db.update(projectAccess).set({ status, error: null, updatedAt: new Date() }).where(eq(projectAccess.id, row.id));
      done.push(`${status === "revoked" ? "забран" : "задача забрать"}: ${SERVICE_LABEL[row.service]} — ${row.email}`);
    } catch (e) {
      const msg = (e as Error).message;
      await db.update(projectAccess).set({ error: `Не удалось забрать: ${msg}`, updatedAt: new Date() }).where(eq(projectAccess.id, row.id));
      problems.push(`Не удалось забрать ${SERVICE_LABEL[row.service]} у ${row.email}: ${msg}`);
    }
  }
  // A person who is no longer wanted and only had their own access: forget the row.
  const stale = rows.filter((r) => ["existing", "failed"].includes(r.status) && !wanted.has(key(r.service, r.target, r.email))).map((r) => r.id);
  if (stale.length) await db.delete(projectAccess).where(inArray(projectAccess.id, stale));

  for (const w of wants) {
    const have = rows.find((r) => key(r.service, r.target, r.email) === key(w.service, w.target, w.email) && r.status !== "revoked" && r.status !== "revoke_task");
    if (have && ACTIVE.includes(have.status)) continue;
    const blocked = notReady(w.service);
    let status = "failed", ref: string | null = null, error: string | null = blocked;
    if (!blocked) {
      try {
        ({ status, ref } = await grant(w, name, projectId, actor));
        error = null;
      } catch (e) {
        error = (e as Error).message;
      }
    }
    if (have) await db.update(projectAccess).set({ status, ref, error, role: w.role, updatedAt: new Date() }).where(eq(projectAccess.id, have.id));
    else await db.insert(projectAccess).values({ id: crypto.randomUUID(), projectId, service: w.service, target: w.target, email: w.email, role: w.role, status, ref, error });
    if (status === "failed") problems.push(`${SERVICE_LABEL[w.service]} для ${w.email}: ${error}`);
    else done.push(`${status === "task" ? "задача выдать" : status === "existing" ? "уже был" : "выдан"}: ${SERVICE_LABEL[w.service]} — ${w.email}`);
  }

  const real = done.filter((d) => !d.startsWith("уже был"));
  if (real.length) await addLog(projectId, { kind: "info", status: "auto", title: "Доступы специалистов обновлены", body: real.join("\n") });
  await condition(projectId, "access", problems.length > 0, {
    kind: "error",
    title: `Не удалось выдать или забрать ${problems.length} ${problems.length === 1 ? "доступ" : "доступа"}`,
    body: problems.join("\n"),
    link: "/inputs",
  }, "Все доступы выданы");
  return { done, problems };
}

/** Nightly: retry failed grants and catch up on changes. */
export async function syncAllAccess() {
  const list = await getDb().select({ id: projects.id }).from(projects);
  const out: { projectId: string; kind: string; ok: boolean; message: string }[] = [];
  for (const p of list) {
    try {
      const r = await syncProjectAccess(p.id);
      if (r.done.length || r.problems.length) out.push({ projectId: p.id, kind: "access", ok: r.problems.length === 0, message: [...r.done, ...r.problems].join("; ") });
    } catch (e) {
      out.push({ projectId: p.id, kind: "access", ok: false, message: (e as Error).message });
    }
  }
  return out;
}

export async function listProjectAccess(projectIds: string[]) {
  if (!projectIds.length) return [];
  return getDb().select().from(projectAccess).where(inArray(projectAccess.projectId, projectIds));
}
