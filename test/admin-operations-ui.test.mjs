import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("owner account interface distinguishes interest, pages stored reactions and guards account changes", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const out = path.join(folder, "AdminOperations.mjs");
  await build({
    entryPoints: ["src/components/AdminOperations.jsx"],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example/admin",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { AdminOperations } = await import(pathToFileURL(out));
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const account = {
    id: "member-id",
    username: "Member",
    provider: "local",
    preferences: {},
    settings: {},
    version: "v1",
    reactionCounts: [],
  };
  const calls = [];
  const api = async (url, body) => {
    calls.push({ url, body });
    if (url === "/api/admin/accounts")
      return { accounts: [account], total: 1, hasMore: false };
    if (url === "/api/admin/account?id=member-id")
      return {
        account,
        network: { ip: "198.51.100.1", country: "US", city: "Test City" },
        reactions: [
          {
            id: 1,
            action: "watch",
            anime: { id: 1, title: "Interested anime" },
          },
        ],
        totalReactions: 2,
        truncated: true,
        taste: { interests: [], curious: [], contrasts: [] },
        genres: [],
        history: [],
        scope: "Private MAL lists are not stored here.",
        warnings: [],
      };
    if (url === "/api/admin/account/reactions?id=member-id&offset=1")
      return {
        reactions: [
          { id: 2, action: "good", anime: { id: 2, title: "Enjoyed anime" } },
        ],
        hasMore: false,
      };
    throw Error("Unexpected request " + url);
  };
  const button = (text) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === text,
    );
  try {
    await act(async () =>
      root.render(
        React.createElement(AdminOperations, {
          section: "accounts",
          api,
          currentAccount: "owner",
        }),
      ),
    );
    await act(async () => button("Member").click());
    assert.match(document.body.textContent, /198\.51\.100\.1/);
    assert.match(
      document.body.textContent,
      /Curiosity, not confirmed enjoyment/,
    );
    assert.match(
      document.body.textContent,
      /Private MAL lists are not stored here/,
    );
    assert.equal(button("Apply account change").disabled, true);
    const more = [...document.querySelectorAll("button")].find((b) =>
      /Load more/.test(b.textContent),
    );
    assert.ok(more);
    await act(async () => more.click());
    assert.match(document.body.textContent, /Enjoyed anime/);
    assert.match(document.body.textContent, /2 loaded of 2/);
    assert.equal(
      calls.some((c) => c.body),
      false,
    );
    assert.equal(document.querySelector('input[type="password"]'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});

test("category analytics scans only on request, merges pages, filters and exports", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const out = path.join(folder, "TaxonomyAnalytics.mjs");
  await build({
    entryPoints: ["src/components/TaxonomyAnalytics.jsx"],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example/admin",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { TaxonomyAnalytics } = await import(pathToFileURL(out));
  const { taxonomyAnalytics } =
    await import("../src/lib/taxonomy-analytics.js");
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const a = { id: 1, genres: ["Real Robot"] };
  const calls = [];
  const api = async (url) => {
    calls.push(url);
    return {
      ...taxonomyAnalytics([a]),
      nextCursor: calls.length === 1 ? 1 : null,
    };
  };
  const button = (label) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === label,
    );
  const oldCreate = URL.createObjectURL,
    oldRevoke = URL.revokeObjectURL;
  let exported;
  URL.createObjectURL = (blob) => {
    exported = blob;
    return "blob:test";
  };
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  try {
    await act(async () =>
      root.render(
        React.createElement(TaxonomyAnalytics, {
          api,
          reactions: taxonomyAnalytics([], [{ anime: a, action: "good" }]),
          catalogTotal: 2,
        }),
      ),
    );
    assert.equal(calls.length, 0);
    assert.match(
      document.body.textContent,
      /Catalog coverage has not been scanned/,
    );
    await act(async () => button("Scan catalog coverage").click());
    assert.match(document.body.textContent, /Partial scan: 1 titles/);
    await act(async () => button("Scan next 250 titles").click());
    assert.deepEqual(calls, [
      "/api/admin/taxonomy?after=0",
      "/api/admin/taxonomy?after=1",
    ]);
    assert.match(document.body.textContent, /Complete scan: 2 titles/);
    assert.equal(button("Scan next 250 titles").disabled, true);
    await act(async () => {
      const select = document.querySelector("select");
      select.value = "missing";
      select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
    assert.equal(
      [...document.querySelectorAll("tbody th")].some(
        (n) => n.textContent === "Mecha",
      ),
      false,
    );
    await act(async () => button("Export category analytics").click());
    const saved = JSON.parse(await exported.text());
    assert.equal(saved.catalog.titleCount, 2);
    assert.equal(saved.catalogScanComplete, true);
    assert.equal(saved.reactions.reactionCount, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
    await rm(folder, { recursive: true, force: true });
  }
});
