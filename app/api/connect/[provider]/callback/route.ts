import { cookies } from "next/headers";
import { safeEqual } from "@/lib/crypto";
import { addLog } from "@/lib/log/store";
import { exchangeCode, isProvider } from "@/lib/social/oauth";
import { projectByConnectToken, saveConnections } from "@/lib/social/store";

/** The network returns here with a code: check the state, exchange the code, store the accounts, go back to the link page. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!isProvider(provider)) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const jar = await cookies();
  const [state, token] = (jar.get(`connect_${provider}`)?.value ?? "").split(".");
  jar.delete({ name: `connect_${provider}`, path: "/api/connect" });
  const project = token ? await projectByConnectToken(token) : null;
  if (!state || !project || !safeEqual(state, url.searchParams.get("state") ?? "")) return new Response("Ссылка устарела. Откройте её заново.", { status: 400 });

  const back = (query: string) => Response.redirect(new URL(`/connect/${token}?${query}`, request.url));
  const code = url.searchParams.get("code");
  // The client pressed «Cancel» on the consent screen.
  if (!code) return back("error=denied");
  try {
    const accounts = await exchangeCode(provider, code);
    if (!accounts.length) return back("error=empty");
    await saveConnections(project.projectId, accounts);
    await addLog(project.projectId, {
      area: "smm",
      kind: "info",
      status: "done",
      title: `Клиент подключил соцсети: ${accounts.map((a) => `${a.network} ${a.name}`).join(", ")}`,
    }).catch(() => undefined);
    return back(`done=${provider}`);
  } catch (error) {
    console.error("social connect failed", provider, (error as Error).message);
    return back("error=failed");
  }
}
