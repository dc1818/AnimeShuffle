import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("scene artwork stays separate from animated objects and old settings migrate", async () => {
  const dir = await mkdtemp(path.resolve(".scene-test-"));
  try {
    await build({
      entryPoints: ["src/components/SceneEnvironment.jsx"],
      outfile: path.join(dir, "scene.mjs"),
      bundle: true,
      platform: "node",
      format: "esm",
      jsx: "automatic",
      packages: "external",
    });
    const { SceneEnvironment, SCENE_STYLES, resolveBackgroundStyle } =
      await import(pathToFileURL(path.join(dir, "scene.mjs")));
    for (const [mode] of SCENE_STYLES) {
      const html = renderToStaticMarkup(
        React.createElement(SceneEnvironment, { mode }),
      );
      assert.equal((html.match(/<image /g) || []).length, 1);
      assert.match(html, new RegExp(`${mode}-scene.webp`));
      assert.doesNotMatch(html, /<canvas|feDisplacementMap|painted-atmosphere/);
    }
    assert.equal(resolveBackgroundStyle("sakura"), "rail");
    assert.equal(resolveBackgroundStyle("orbit"), "hangar");
    assert.equal(resolveBackgroundStyle("skyislands"), "observatory");
    assert.equal(resolveBackgroundStyle("aurora"), "aurora");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
