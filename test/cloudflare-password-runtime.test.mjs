import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test(
  "Worker registration and login survive the hosted native PBKDF2 limit",
  { timeout: 120000 },
  async () => {
    const compiled = await build({
      entryPoints: ["cloudflare/worker.mjs"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      external: ["cloudflare:workers"],
      target: "es2022",
      // Local workerd does not enforce the hosted iteration ceiling. Reproduce
      // that rejection at the native boundary; all app/storage/portable crypto
      // code below is the production implementation running in a real DO.
      plugins: [
        {
          name: "hosted-pbkdf2-limit",
          setup(builder) {
            builder.onResolve({ filter: /^node:crypto$/ }, (args) =>
              args.namespace === "capped-crypto"
                ? undefined
                : { path: args.path, namespace: "capped-crypto" },
            );
            builder.onLoad(
              { filter: /.*/, namespace: "capped-crypto" },
              () => ({
                contents: `
            export * from "node:crypto";
            import { pbkdf2Sync as native } from "node:crypto";
            export function pbkdf2Sync(...args) {
              if (args[2] > 100000) throw new DOMException(
                "Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)",
                "NotSupportedError");
              return native(...args);
            }
          `,
                loader: "js",
              }),
            );
          },
        },
      ],
    });
    const origin = "https://shuffle.example";
    const mf = new Miniflare(
      convertV4MiniflareOptions({
        host: "127.0.0.1",
        inspectorHost: "127.0.0.1",
        modules: true,
        script: compiled.outputFiles[0].text,
        compatibilityDate: "2026-09-01",
        compatibilityFlags: ["nodejs_compat"],
        durableObjects: {
          BACKEND: { className: "AnimeBackend", useSQLite: true },
        },
        bindings: {
          TOKEN_ENCRYPTION_KEY: "ab".repeat(32),
          PUBLIC_ORIGIN: origin,
          REVIEW_ENRICHMENT: "false",
          AI_TASTE_ENRICHMENT: "false",
        },
      }),
    );
    let cookie = "",
      csrf = "";
    async function call(path, data) {
      const response = await mf.dispatchFetch(origin + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          cookie,
          origin,
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      if (response.headers.has("set-cookie"))
        cookie = response.headers.get("set-cookie").split(";")[0];
      const body = await response.json();
      if (body.csrf) csrf = body.csrf;
      return { status: response.status, body };
    }
    const credentials = {
      username: "RuntimeViewer",
      password: "a secure runtime test password",
    };
    try {
      assert.equal((await call("/api/session")).status, 200);
      const registered = await call("/api/account/register", credentials);
      assert.equal(registered.status, 200, JSON.stringify(registered.body));
      assert.equal(registered.body.account.name, credentials.username);
      const accountId = registered.body.account.id;
      assert.equal(
        (
          await call("/api/account/preferences", {
            preferences: { favoriteGenres: ["Action"] },
          })
        ).status,
        200,
      );
      assert.equal((await call("/api/logout", {})).status, 200);
      assert.equal(
        (
          await call("/api/account/login", {
            ...credentials,
            password: "wrong password",
          })
        ).status,
        401,
      );
      assert.equal(
        (
          await call("/api/account/login", {
            ...credentials,
            username: "NotAnAccount",
          })
        ).status,
        401,
      );
      const loggedIn = await call("/api/account/login", credentials);
      assert.equal(loggedIn.status, 200, JSON.stringify(loggedIn.body));
      assert.equal(loggedIn.body.account.id, accountId);
      assert.deepEqual(
        (await call("/api/account/state")).body.preferences.favoriteGenres,
        ["Action"],
      );
      assert.equal((await call("/api/logout", {})).status, 200);
      assert.equal(
        (await call("/api/account/register", credentials)).status,
        409,
      );
    } finally {
      await mf.dispose();
    }
  },
);
