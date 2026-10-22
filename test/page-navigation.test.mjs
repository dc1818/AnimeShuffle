import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { pageFromHash, usePageNavigation } from "../src/lib/page-navigation.js";

test("page navigation restores deep links, reloads and Back/Forward without losing query parameters", async () => {
  const dom = new JSDOM('<div id="root"></div>', {
    url: "https://example.test/AnimeShuffle/?keep=1#watchlist",
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  function Harness() {
    const [page, navigate] = usePageNavigation();
    return React.createElement(
      "button",
      { onClick: () => navigate("recommendations") },
      page,
    );
  }
  const root = createRoot(document.getElementById("root"));
  const label = () => document.querySelector("button").textContent;
  async function traverse(direction) {
    await act(async () => {
      await new Promise((resolve) => {
        window.addEventListener("popstate", resolve, { once: true });
        window.history[direction]();
      });
    });
  }
  try {
    await act(async () => root.render(React.createElement(Harness)));
    assert.equal(label(), "watchlist");
    await act(async () => document.querySelector("button").click());
    assert.equal(window.location.hash, "#recommendations");
    assert.equal(window.location.search, "?keep=1");
    assert.equal(window.location.pathname, "/AnimeShuffle/");
    await traverse("back");
    assert.equal(label(), "watchlist");
    await traverse("forward");
    assert.equal(label(), "recommendations");
    await act(async () =>
      root.render(React.createElement(Harness, { key: "remount" })),
    );
    assert.equal(
      label(),
      "recommendations",
      "A fresh mount restores the current URL",
    );
    assert.equal(pageFromHash("#unknown"), "discover");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
