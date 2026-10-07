/** Server-only primitives. Durable Objects provide the CPU budget for password hashing. */
import {
  randomBytes,
  createHash,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
export { passwordHash } from "./password-hash.mjs";
export const random = () => randomBytes(32).toString("base64url");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function vault(secret) {
  if (!/^[a-f0-9]{64}$/i.test(secret || ""))
    throw new Error(
      "Set TOKEN_ENCRYPTION_KEY to 64 random hexadecimal characters.",
    );
  const key = Buffer.from(secret, "hex");
  return {
    seal(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const bytes = Buffer.concat([
        cipher.update(JSON.stringify(value), "utf8"),
        cipher.final(),
      ]);
      return [iv, cipher.getAuthTag(), bytes]
        .map((b) => b.toString("base64url"))
        .join(".");
    },
    open(value) {
      const [iv, tag, bytes] = value
        .split(".")
        .map((x) => Buffer.from(x, "base64url"));
      const cipher = createDecipheriv("aes-256-gcm", key, iv);
      cipher.setAuthTag(tag);
      return JSON.parse(
        Buffer.concat([cipher.update(bytes), cipher.final()]).toString(),
      );
    },
  };
}
export function secure(response) {
  const r = new Response(response.body, response);
  r.headers.set("X-Content-Type-Options", "nosniff");
  r.headers.set("Referrer-Policy", "no-referrer");
  r.headers.set("X-Frame-Options", "DENY");
  r.headers.set("Strict-Transport-Security", "max-age=31536000");
  r.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://cdn.myanimelist.net https://api-cdn.myanimelist.net; connect-src 'self'; frame-src https://www.youtube-nocookie.com; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  return r;
}
