import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { normalizePreferences } from "../src/lib/preferences.js";

test("viewing preferences dismisses on backdrop clicks but not inside clicks", async () => {
  const folder = await mkdtemp(path.resolve(".dialog-ui-"));
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  try {
    await build({ entryPoints: ["src/components/Dialogs.jsx"], outfile: path.join(folder, "ui.mjs"), bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external" });
    const { Dialogs } = await import(pathToFileURL(path.join(folder, "ui.mjs")));
    let closed = 0;
    await act(async () => root.render(React.createElement(Dialogs, { kind: "preferences", state: { session: { account: { id: 1 } }, onboardingComplete: true, preferences: normalizePreferences(), settings: {}, busy: false }, store: {}, onClose: () => closed++ })));
    const dialog = document.querySelector("dialog");
    dialog.getBoundingClientRect = () => ({ left: 100, right: 500, top: 100, bottom: 600 });
    await act(async () => dialog.querySelector("h2").dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 150, clientY: 150 })));
    assert.equal(closed, 0);
    await act(async () => dialog.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 120, clientY: 120 })));
    assert.equal(closed, 0, "Dialog padding is inside, not backdrop");
    await act(async () => dialog.dispatchEvent(new window.MouseEvent("click", { bubbles: true, clientX: 20, clientY: 20 })));
    assert.equal(closed, 1);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    await rm(folder, { recursive: true, force: true });
  }
});
