import "server-only";
import { appUrl, sendTelegram, telegramConfigured } from "@/lib/log/notify";
import type { AutoInvoiceResult } from "./auto-invoices";
import { money } from "./fx";
import { monthWord } from "./labels";
import { buildFinanceReport } from "./report";

/**
 * Money reminders for the owner, to one Telegram chat (FINANCE_TELEGRAM_CHAT_ID; a topic of a forum chat can be
 * given as «chatId:threadId»). Three of them, each on its own day, each with a button to the page to act on:
 *   — the invoices for the next month have been issued (the day the cron issues them, from the 25th);
 *   — the 1st: what has to be paid out to the team for the month just closed;
 *   — the 3rd: the clients who have not paid for the current month.
 * Nothing is sent when there is nothing to do.
 */
export const PAYOUT_DAY = 1;
export const UNPAID_DAY = 3;

function target(): { chat: string; thread: number | null } | null {
  const raw = (process.env.FINANCE_TELEGRAM_CHAT_ID ?? "").trim();
  if (!raw || !telegramConfigured()) return null;
  const [chat, thread] = raw.split(":");
  return { chat, thread: thread ? Number(thread) || null : null };
}

export async function financeReminders(invoices: AutoInvoiceResult, now = new Date()) {
  const to = target();
  if (!to) return { sent: 0, skipped: "FINANCE_TELEGRAM_CHAT_ID не задан" };
  const day = now.getUTCDate();
  const messages: { text: string; button: { text: string; url: string } }[] = [];

  if (invoices.created.length) {
    messages.push({
      text: `🧾 Счета на ${monthWord(invoices.created[0].month)} выставлены:\n${invoices.created.map((x) => `• ${x.project} — ${money(x.total, x.currency)}`).join("\n")}`,
      button: { text: "Открыть счета", url: `${appUrl()}/finance/clients#payments` },
    });
  }
  if (invoices.recounted.length) {
    messages.push({
      text: `🧾 Пересчитан % в счетах:\n${invoices.recounted.map((x) => `• ${x.project}: ${money(x.from, x.currency)} → ${money(x.to, x.currency)}`).join("\n")}`,
      button: { text: "Открыть счета", url: `${appUrl()}/finance/clients#payments` },
    });
  }

  if (day === PAYOUT_DAY || day === UNPAID_DAY) {
    const r = await buildFinanceReport();
    if (day === PAYOUT_DAY) {
      const due = r.payoutsDue.filter((d) => !d.paid && d.amount > 0);
      if (due.length) {
        const total = due.reduce((a, d) => a + d.amount, 0);
        messages.push({
          text: `💸 Зарплаты за ${monthWord(due[0].month)} — ${money(total)}:\n${due.map((d) => `• ${d.name} — ${money(d.amount)}`).join("\n")}`,
          button: { text: "Открыть зарплаты", url: `${appUrl()}/finance/payroll` },
        });
      }
    }
    if (day === UNPAID_DAY) {
      const owing = r.projects.filter((p) => p.status === "active" && p.pay && p.pay.debt >= 1);
      if (owing.length) {
        messages.push({
          text: `⏳ Не оплатили ${monthWord(r.now)}:\n${owing.map((p) => `• ${p.name} — ${money(p.pay!.debt, p.pay!.currency)}`).join("\n")}`,
          button: { text: "Открыть клиентов", url: `${appUrl()}/finance/clients` },
        });
      }
    }
  }

  let sent = 0;
  const errors: string[] = [];
  for (const m of messages) {
    try {
      await sendTelegram(to.chat, to.thread, m.text, m.button);
      sent++;
    } catch (error) {
      errors.push((error as Error).message);
    }
  }
  return { sent, errors };
}
