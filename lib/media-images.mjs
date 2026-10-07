import { validImage } from "./mal.mjs";
/** Keep MAL cover validation unchanged; only our image proxy accepts the fixed
 * YouTube thumbnail path. Never turn the proxy into a general URL fetcher. */
export function validProxyImage(raw) {
  if (validImage(raw)) return true;
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      u.hostname === "i.ytimg.com" &&
      !u.port &&
      !u.username &&
      !u.password &&
      !u.search &&
      !u.hash &&
      /^\/vi\/[A-Za-z0-9_-]{11}\/mqdefault\.jpg$/.test(u.pathname)
    );
  } catch {
    return false;
  }
}
