import { countryCode } from "../lib/media-region.mjs";
import { validProxyImage } from "../lib/media-images.mjs";
import { isPublicMetadataRequest } from "./public-routes.mjs";
import { DurableObject } from "cloudflare:workers";
import { createCloudApp } from "./app.mjs";
import { secure } from "./security.mjs";

/** One coordinator is appropriate for this small app and serializes MAL writes/refreshes.
 * SQLite belongs to this stable object name; never rename it when deploying updates.
 */
export class AnimeBackend extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.app = createCloudApp(ctx.storage, env, {
      waitUntil: (promise) => ctx.waitUntil(promise),
    });
    this.tail = Promise.resolve();
  }
  alarm() {
    return this.app.alarm();
  }
  fetch(request) {
    // Public metadata uses its own cache and MAL throttle, with no session writes.
    // Keep account mutations and token refreshes serialized as before.
    if (isPublicMetadataRequest(request))
      return this.app.fetch(request).then((response) => {
        if (request.headers.get("X-AnimeShuffle-Debug") === "1")
          response.headers.append("Server-Timing", "coordinator_queue;dur=0.0");
        return response;
      });
    const queuedAt = performance.now();
    const next = this.tail.then(async () => {
      const wait = performance.now() - queuedAt;
      const response = await this.app.fetch(request);
      if (request.headers.get("X-AnimeShuffle-Debug") === "1")
        response.headers.append(
          "Server-Timing",
          `coordinator_queue;dur=${wait.toFixed(1)}`,
        );
      return response;
    });
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
      if (request.method !== "GET" || !validProxyImage(target))
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
    if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
      const forwarded = new Request(request);
      // Overwrite any client-supplied value before entering the private object.
      forwarded.headers.set(
        "X-AnimeShuffle-Country",
        countryCode(request.cf?.country) || "",
      );
      for (const [header, key] of [
        ["Region", "region"],
        ["City", "city"],
        ["Timezone", "timezone"],
      ]) {
        // Only trusted edge metadata reaches analytics; overwrite client values.
        const value = String(request.cf?.[key] || "")
          .replace(/[^\x20-\x7E]/g, "")
          .slice(0, 100);
        forwarded.headers.set("X-AnimeShuffle-" + header, value);
      }
      return env.BACKEND.get(env.BACKEND.idFromName("anime-shuffle-v1")).fetch(
        forwarded,
      );
    }
    if (["/admin", "/admin/"].includes(url.pathname)) {
      // Fetch the canonical asset URL internally; /index.html redirects to /
      // in Cloudflare Assets and would otherwise lose the /admin route.
      const entry = new URL("/", url);
      return secure(await env.ASSETS.fetch(new Request(entry, request)));
    }
    return secure(await env.ASSETS.fetch(request));
  },
};
