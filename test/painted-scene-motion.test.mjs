import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import React, { act } from "react";

test("painted motion pauses for dialogs and preserves a static fallback on disable or GPU loss", async () => {
  const folder = await mkdtemp(path.resolve(".scene-test-"));
  try {
    await build({
      entryPoints: ["src/components/PaintedSceneMotion.jsx"],
      outfile: path.join(folder, "scene.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { PaintedSceneMotion } = await import(
      pathToFileURL(path.join(folder, "scene.mjs"))
    );
    const dom = new JSDOM(
      '<body><div id="root"></div><dialog></dialog></body>',
      { pretendToBeVisual: true },
    );
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.MutationObserver = dom.window.MutationObserver;
    globalThis.ResizeObserver = class {
      observe() {}
      disconnect() {}
    };
    let queue = new Map(),
      serial = 0,
      draws = 0,
      deletes = 0,
      image;
    globalThis.requestAnimationFrame = (fn) => {
      queue.set(++serial, fn);
      return serial;
    };
    globalThis.cancelAnimationFrame = (id) => queue.delete(id);
    globalThis.Image = class {
      constructor() {
        image = this;
      }
      set src(value) {
        this.url = value;
      }
    };
    const gl = new Proxy(
      {},
      {
        get: (_, name) => {
          if (name === "getShaderParameter" || name === "getProgramParameter")
            return () => true;
          if (name === "drawArrays") return () => draws++;
          if (name === "deleteTexture") return () => deletes++;
          if (String(name).startsWith("create")) return () => ({});
          return () => {};
        },
      },
    );
    dom.window.HTMLCanvasElement.prototype.getContext = () => gl;
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(document.getElementById("root"));
    const render = (active) =>
      act(() =>
        root.render(
          React.createElement(PaintedSceneMotion, { mode: "sakura", active }),
        ),
      );
    const tick = (time) => {
      const pending = [...queue.values()];
      queue.clear();
      pending.forEach((fn) => fn(time));
    };
    await render(true);
    image.onload();
    tick(100);
    assert.equal(draws, 1);
    assert.equal(document.querySelector("canvas").style.opacity, "1");
    document.querySelector("dialog").setAttribute("open", "");
    await new Promise((r) => setTimeout(r, 0));
    tick(200);
    assert.equal(draws, 1, "dialog stops drawing");
    document.querySelector("dialog").removeAttribute("open");
    await new Promise((r) => setTimeout(r, 0));
    tick(300);
    assert.equal(draws, 2, "closing dialog resumes");
    document
      .querySelector("canvas")
      .dispatchEvent(
        new dom.window.Event("webglcontextlost", { cancelable: true }),
      );
    assert.equal(queue.size, 0);
    assert.equal(document.querySelector("canvas").style.opacity, "0");
    await render(false);
    assert.equal(deletes, 1);
    assert.equal(queue.size, 0);
    await act(() => root.unmount());
    dom.window.close();
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
