import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

test("backend startup failure returns safe JSON while static pages remain available", async () => {
  const compiled = await build({
    entryPoints: ["cloudflare/worker.mjs"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    target: "es2022",
    plugins: [
      {
        name: "durable-base-fixture",
        setup(builder) {
          builder.onResolve({ filter: /^cloudflare:workers$/ }, () => ({
            path: "base",
            namespace: "fixture",
          }));
          builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
            contents: "export class DurableObject {}",
          }));
        },
      },
    ],
  });
  const { default: worker } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`
  );
  const env = {
    BACKEND: {
      idFromName: () => "same-coordinator",
      get: () => ({
        fetch: async () => {
          throw Error("private error sentinel");
        },
      }),
    },
    ASSETS: { fetch: async () => new Response("static site") },
  };
  const response = await worker.fetch(
    new Request("https://shuffle.example/api/session"),
    env,
  );
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Retry-After"), "300");
  const body = await response.json();
  assert.match(body.error, /temporarily unavailable/);
  assert.doesNotMatch(JSON.stringify(body), /private error sentinel/);
  const page = await worker.fetch(new Request("https://shuffle.example/"), env);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), "static site");
});
