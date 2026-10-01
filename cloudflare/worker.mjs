import { DurableObject } from "cloudflare:workers";
import { createCloudApp } from "./app.mjs";
import { secure } from "./security.mjs";
import { validImage } from "../lib/mal.mjs";

/** One coordinator is appropriate for this small app and serializes MAL writes/refreshes.
 * SQLite belongs to this stable object name; never rename it when deploying updates.
 */
export class AnimeBackend extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.app = createCloudApp(ctx.storage, env);
    this.tail = Promise.resolve();
  }
  fetch(request) {
    const next = this.tail.then(() => this.app.fetch(request));
    this.tail = next.catch(() => {});
    return next;
  }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (env.PUBLIC_ORIGIN && url.origin !== env.PUBLIC_ORIGIN)
      return secure(
        new Response("Open the configured Anime Shuffle address.", {
          status: 403,
        }),
      );
    if (url.pathname === "/healthz")
      return secure(
        new Response("ok", { headers: { "Cache-Control": "no-store" } }),
      );
    if (url.pathname === "/api/image") {
      const target = url.searchParams.get("url");
      if (request.method !== "GET" || !validImage(target))
        return secure(new Response("Invalid cover URL", { status: 400 }));
      try {
        const image = await fetch(target, {
          // Workerd requires manual redirects; non-2xx responses are rejected below.
          redirect: "manual",
          signal: AbortSignal.timeout(15000),
          cf: { cacheTtl: 1800 },
        });
        if (
          !image.ok ||
          !image.headers.get("content-type")?.startsWith("image/") ||
          Number(image.headers.get("content-length")) > 8 * 1024 * 1024
        )
          throw Error();
        const reader = image.body.getReader();
        const chunks = [];
        let size = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8 * 1024 * 1024) {
            await reader.cancel();
            throw Error();
          }
          chunks.push(value);
        }
        return secure(
          new Response(new Blob(chunks), {
            headers: {
              "Content-Type": image.headers.get("content-type"),
              "Cache-Control": "public, max-age=1800",
            },
          }),
        );
      } catch {
        return secure(new Response("Cover unavailable", { status: 502 }));
      }
    }
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/"))
      return env.BACKEND.get(env.BACKEND.idFromName("anime-shuffle-v1")).fetch(
        request,
      );
    return secure(await env.ASSETS.fetch(request));
  },
};
