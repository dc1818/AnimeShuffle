import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { RESEARCH_SEED } from "../data/research-seed.mjs";

test("admin UI denies guest access and previews JSON before import without starting discovery", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-")),
    out = path.join(folder, "Admin.mjs");
  await build({
    entryPoints: ["src/components/Admin.jsx"],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { Admin } = await import(pathToFileURL(out));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example/admin",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const originalFetch = globalThis.fetch,
    calls = [];
  let owner = false,
    imports = 0;
  const status = {
    catalog: 50,
    profiles: 25,
    pending: 25,
    preliminary: 20,
    stale: 0,
    revision: 1,
    history: [],
    instructions: [],
    vocabulary: [],
    enrichment: { reviews: {}, episodes: {} },
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push(url);
    if (url === "/api/session")
      return Response.json({
        admin: owner,
        csrf: "test",
        account: owner ? { id: "owner", name: "Owner" } : null,
      });
    if (url === "/api/admin/status") return Response.json(status);
    if (url.startsWith("/api/admin/export"))
      return Response.json({ ...RESEARCH_SEED, nextCursor: null });
    if (url === "/api/admin/validate")
      return Response.json({
        count: 25,
        newProfiles: 0,
        replacements: 25,
        staleInputs: [],
        digest: "digest",
        revision: 1,
        titles: RESEARCH_SEED.profiles.map((p) => ({
          id: p.malId,
          title: p.title,
          traits: 4,
          status: p.status,
        })),
      });
    if (url === "/api/admin/import") {
      assert.equal(options.headers["X-CSRF-Token"], "test");
      const body = JSON.parse(options.body);
      assert.equal(body.digest, "digest");
      assert.equal(body.revision, 1);
      imports++;
      return Response.json({ imported: 25, revision: 2 });
    }
    throw Error("Unexpected request: " + url);
  };
  const { createRoot } = await import("react-dom/client");
  let root = createRoot(document.getElementById("root"));
  try {
    await act(async () => root.render(React.createElement(Admin)));
    assert.match(document.body.textContent, /Sign in with your existing/);
    assert.equal(document.querySelector('input[type="file"]'), null);
    assert.deepEqual(calls, ["/api/session"]);
    await act(async () => root.unmount());
    owner = true;
    root = createRoot(document.getElementById("root"));
    await act(async () => root.render(React.createElement(Admin)));
    assert.match(document.body.textContent, /Awaiting analysis/);
    const fileInput = document.querySelector('input[type="file"]');
    const change = async (file) => {
      Object.defineProperty(fileInput, "files", {
        value: [file],
        configurable: true,
      });
      await act(async () =>
        fileInput.dispatchEvent(
          new dom.window.Event("change", { bubbles: true }),
        ),
      );
    };
    await change({
      name: "wrong.exe",
      size: 1,
      type: "application/octet-stream",
      text: async () => "{}",
    });
    assert.match(document.body.textContent, /Choose a JSON research file/);
    assert.equal(calls.includes("/api/admin/validate"), false);
    await change({
      name: "research.json",
      size: 1000,
      type: "application/json",
      text: async () => JSON.stringify(RESEARCH_SEED),
    });
    assert.match(document.body.textContent, /File validated/);
    assert.equal(imports, 0);
    const importButton = [...document.querySelectorAll("button")].find(
      (b) => b.textContent === "Import 25 profiles",
    );
    await act(async () => importButton.click());
    assert.equal(imports, 1);
    assert.match(document.body.textContent, /Imported 25 profiles/);
    assert.equal(
      calls.some(
        (u) =>
          u.startsWith("/api/catalog") ||
          u.startsWith("/api/list") ||
          u.startsWith("/api/taste"),
      ),
      false,
    );
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
