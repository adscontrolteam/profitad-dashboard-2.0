import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Secrets at rest (CRM tokens, webhook keys): AES-256-GCM with TOKEN_ENCRYPTION_KEY from the env.
 * A database dump alone is useless without the key. Format: v1.<iv>.<tag>.<ciphertext>, base64url.
 */
function key() {
  const raw = process.env.TOKEN_ENCRYPTION_KEY ?? "";
  if (raw.length < 32) throw new Error("TOKEN_ENCRYPTION_KEY не задан (нужно минимум 32 символа)");
  return createHash("sha256").update(raw).digest();
}

export const hasEncryptionKey = () => (process.env.TOKEN_ENCRYPTION_KEY ?? "").length >= 32;

export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), data].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decrypt(sealed: string) {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Некорректный зашифрованный секрет");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
}

export const randomToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** Constant-time comparison for webhook keys. */
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
