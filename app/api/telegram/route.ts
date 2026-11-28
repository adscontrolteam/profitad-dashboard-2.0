import { linkTelegramChat, notifyBotConfigured, sendPersonal } from "@/lib/notify/team-telegram";

/**
 * Webhook of the notifications bot (TELEGRAM_NOTIFY_BOT_TOKEN). Telegram signs each call with the secret set in
 * setWebhook (TELEGRAM_NOTIFY_SECRET). A private message from a @username the admin entered in «Доступы» links
 * that person's chat; from then on deadline reminders and project-score news reach them here.
 */
export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_NOTIFY_SECRET;
  if (!notifyBotConfigured() || !secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return Response.json({ ok: false }, { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as {
    message?: { chat?: { id?: number; type?: string }; from?: { username?: string; first_name?: string } };
  } | null;
  const msg = update?.message;
  if (!msg?.chat?.id || msg.chat.type !== "private") return Response.json({ ok: true });

  const chatId = String(msg.chat.id);
  const linked = await linkTelegramChat(msg.from?.username, chatId);
  const hi = msg.from?.first_name ? `${msg.from.first_name}, ` : "";
  const text = linked.length
    ? `✅ ${hi}готово! Сюда будут приходить напоминания о дедлайнах задач и новости по твоим проектам из дашборда PROFITAD.`
    : msg.from?.username
      ? `Не нашёл @${msg.from.username} в дашборде PROFITAD. Попроси администратора указать этот username в «Доступах», а потом нажми /start ещё раз.`
      : "У тебя в Telegram не задан username. Задай его в настройках Telegram, передай администратору и нажми /start ещё раз.";
  await sendPersonal(chatId, text).catch(() => undefined);
  return Response.json({ ok: true });
}
