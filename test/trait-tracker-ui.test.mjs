import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import React, { act } from "react";
import { researchVocabulary } from "../lib/research-profiles.mjs";
import {
  EXTENDED_RESEARCH_TRAITS,
  TRAIT_FAMILIES,
} from "../src/lib/extended-research-traits.js";

test("admin matrix paginates all traits, distinguishes missing from unknown, and hides private outcomes until reveal", async () => {
  const folder = await mkdtemp(path.resolve(".react-test-"));
  const out = path.join(folder, "TraitTracker.mjs");
  await build({
    entryPoints: ["src/components/TraitTracker.jsx"],
    outfile: out,
    bundle: true,
    platform: "node",
    format: "esm",
    jsx: "automatic",
    packages: "external",
  });
  const { TraitTracker } = await import(pathToFileURL(out));
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://shuffle.example/admin",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const secret = EXTENDED_RESEARCH_TRAITS.find(
    (t) => t.familyKey === "arc-outcome",
  );
  const profile = {
    malId: 123,
    observations: [
      {
        key: secret.key,
        score: 0.9,
        confidence: 0.9,
        prominence: "central",
        sources: ["source"],
        evidence: "PRIVATE_OUTCOME_SENTINEL",
      },
      {
        key: EXTENDED_RESEARCH_TRAITS[0].key,
        score: null,
        confidence: 0,
        prominence: "unknown",
        sources: [],
        evidence: "Unresolved",
      },
    ],
  };
  const props = {
    vocabulary: researchVocabulary,
    families: TRAIT_FAMILIES,
    profile,
  };
  const filter = async (name, value) => {
    const label = [...document.querySelectorAll("label")].find((l) =>
      l.textContent.startsWith(name),
    );
    const select = label.querySelector("select");
    await act(async () => {
      select.value = value;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(React.createElement(TraitTracker, props)),
    );
    assert.match(document.body.textContent, /1 assessed, 2586 not assessed/);
    assert.equal(document.querySelectorAll("tbody tr").length, 0);
    await act(async () => {
      const d = document.querySelector("details");
      d.open = true;
      d.dispatchEvent(new window.Event("toggle"));
    });
    assert.equal(document.querySelectorAll("tbody tr").length, 40);
    await filter("Assessment", "unknown");
    assert.equal(document.querySelectorAll("tbody tr").length, 1);
    assert.match(
      document.querySelector("tbody").textContent,
      /Researched, still unknown/,
    );
    await filter("Assessment", "");
    await filter("Family", "arc-outcome");
    assert.equal(document.querySelectorAll("tbody tr").length, 20);
    assert.ok(
      !document.querySelector("tbody").textContent.includes(secret.label),
    );
    assert.ok(!document.body.textContent.includes("PRIVATE_OUTCOME_SENTINEL"));
    await act(async () =>
      root.render(
        React.createElement(TraitTracker, { ...props, revealed: true }),
      ),
    );
    assert.ok(
      document.querySelector("tbody").textContent.includes(secret.label),
    );
    assert.match(document.body.textContent, /PRIVATE_OUTCOME_SENTINEL/);
    await act(async () =>
      root.render(React.createElement(TraitTracker, props)),
    );
    assert.ok(!document.body.textContent.includes("PRIVATE_OUTCOME_SENTINEL"));
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.window;
    delete globalThis.document;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    await rm(folder, { recursive: true, force: true });
  }
});
