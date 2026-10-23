import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { defaultPreferences } from "../src/lib/preferences.js";

test("sectioned settings and preferences preserve state, account controls and save errors", async () => {
  const folder = await mkdtemp(path.resolve(".settings-ui-"));
  await build({
    entryPoints: ["src/components/Dialogs.jsx"],
    outfile: path.join(folder, "dialogs.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { Dialogs } = await import(
    pathToFileURL(path.join(folder, "dialogs.mjs"))
  );
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  let current,
    nav,
    connect,
    calls = [],
    saves = [],
    fail = false;
  const store = {
    setSettings: (patch) => current.setSettings((p) => ({ ...p, ...patch })),
    setAutoAdd: async (v) => {
      calls.push(["autoAdd", v]);
      current.setSettings((p) => ({ ...p, autoAdd: v }));
    },
    searchAnime: async () => [],
    saveViewingPreferences: async (p) => {
      saves.push(p);
      if (fail) throw Error("Save failed; please retry");
      current.setPreferences(p);
    },
    syncAccount: async () => calls.push(["sync"]),
    syncSavedToMal: async () => calls.push(["saves"]),
    disconnect: async () => false,
  };
  function Wrapper() {
    const [kind, setKind] = React.useState("settings"),
      [linked, setLinked] = React.useState(false),
      [settings, setSettings] = React.useState({
        dynamic: true,
        backgroundStyle: "aurora",
        autoAdd: false,
      }),
      [preferences, setPreferences] = React.useState(defaultPreferences);
    nav = setKind;
    connect = setLinked;
    current = { settings, setSettings, preferences, setPreferences };
    return React.createElement(Dialogs, {
      kind,
      store,
      state: {
        session: {
          hosted: true,
          oauthConfigured: true,
          connected: linked,
          cloudSync: linked,
          ...(linked
            ? {
                account: { id: "a", name: "Sample account", provider: "local" },
              }
            : {}),
        },
        settings,
        preferences,
        onboardingComplete: true,
        list: [],
        reactions: {},
        busy: false,
      },
      onClose: () => setKind(null),
      onNavigate: setKind,
    });
  }
  const click = async (selector) =>
    act(async () => document.querySelector(selector).click());
  const section = async (text) =>
    act(async () =>
      [...document.querySelectorAll(".panel-navigation button")]
        .find((b) => b.textContent === text)
        .click(),
    );
  const change = async (selector, value) =>
    act(async () => {
      const el = document.querySelector(selector);
      el.value = value;
      el.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    });
  try {
    await act(async () => root.render(React.createElement(Wrapper)));
    assert.equal(
      document.querySelectorAll('input[name="animated-background"]').length,
      4,
    );
    await click('input[value="off"]');
    assert.equal(current.settings.dynamic, false);
    await click('input[value="comet"]');
    assert.equal(current.settings.dynamic, true);
    assert.equal(current.settings.backgroundStyle, "comet");
    assert.ok(document.querySelector(".apk-download").disabled);
    await section("Account & MyAnimeList");
    assert.ok(
      document.querySelector('[aria-label="Auto-add watchlist to MyAnimeList"]')
        .disabled,
    );
    assert.equal(
      document
        .querySelector('a[href="/auth/start"]')
        .textContent.includes("Connect MyAnimeList"),
      true,
    );
    await act(async () => connect(true));
    await click('[aria-label="Auto-add watchlist to MyAnimeList"]');
    assert.equal(current.settings.autoAdd, true);
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Sync now")
        .click(),
    );
    assert.deepEqual(calls, [["autoAdd", true], ["sync"]]);
    await section("Help");
    assert.equal(document.querySelectorAll(".shortcut-list > div").length, 7);
    await section("Appearance");
    assert.ok(document.querySelector('input[value="comet"]').checked);
    await click('[aria-label="Viewing preferences"]');
    assert.equal(
      document.querySelector("h2").textContent,
      "Viewing preferences",
    );
    assert.equal(saves.length, 0);
    await change(".panel-mobile-select select", "format");
    await act(async () =>
      [...document.querySelectorAll(".panel-checks label")]
        .find((l) => l.textContent.startsWith("Movies"))
        .querySelector("input")
        .click(),
    );
    assert.deepEqual(current.preferences.formats, ["movies"]);
    await change(".panel-mobile-select select", "content");
    await act(async () =>
      [...document.querySelectorAll(".genre-choices button")]
        .find((b) => b.textContent === "Kids / Kodomo")
        .click(),
    );
    assert.equal(current.preferences.childrenTitles, "include");
    assert.deepEqual(current.preferences.requiredCategories, ["Kids"]);
    await click('[aria-label="Include NSFW anime"]');
    assert.equal(current.preferences.includeNsfw, true);
    await change(".panel-mobile-select select", "advanced");
    await change('[aria-label="Minimum score"]', "8");
    await change('[aria-label="Maximum score"]', "7");
    assert.equal(current.preferences.scoreMin, 7);
    assert.equal(current.preferences.scoreMax, 7);
    await click('[aria-label="Finished shows only"]');
    assert.equal(current.preferences.finishedOnly, true);
    await click('[aria-label="Reset Advanced filters"]');
    assert.equal(current.preferences.scoreMin, null);
    assert.equal(current.preferences.finishedOnly, false);
    assert.deepEqual(current.preferences.formats, ["movies"]);
    assert.equal(current.preferences.includeNsfw, true);
    assert.equal(current.settings.autoAdd, true);
    fail = true;
    await click('[aria-label="Include unknown lengths or formats"]');
    assert.match(
      document.querySelector('[role="alert"]').textContent,
      /Save failed/,
    );
    fail = false;
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Retry")
        .click(),
    );
    assert.equal(current.preferences.includeUnknown, false);
    await act(async () =>
      [...document.querySelectorAll("button")]
        .find((b) => b.textContent === "Done")
        .click(),
    );
    assert.equal(document.querySelector("dialog"), null);
    await act(async () => nav("preferences"));
    await section("Format & length");
    assert.ok(
      [...document.querySelectorAll(".panel-checks label")]
        .find((l) => l.textContent.startsWith("Movies"))
        .querySelector("input").checked,
    );
    await click('[aria-label="Close dialog"]');
    assert.equal(document.querySelector("dialog"), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
