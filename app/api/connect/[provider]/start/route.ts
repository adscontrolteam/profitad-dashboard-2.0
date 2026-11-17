import { cookies } from "next/headers";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl, isProvider, providerConfigured } from "@/lib/social/oauth";
import { projectByConnectToken } from "@/lib/social/store";

/** Sends the client to the network's consent screen. The link token and a one-time state live in an httpOnly cookie until the callback. */
export async function GET(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!isProvider(provider) || !(await projectByConnectToken(token))) return new Response("Not found", { status: 404 });
  if (!providerConfigured(provider)) return Response.redirect(new URL(`/connect/${token}?error=setup`, request.url));
  const state = randomToken(18);
  (await cookies()).set(`connect_${provider}`, `${state}.${token}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/connect", maxAge: 900 });
  return Response.redirect(authorizeUrl(provider, state));
}
