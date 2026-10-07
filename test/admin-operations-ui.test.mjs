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
