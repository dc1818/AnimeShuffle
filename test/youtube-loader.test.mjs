import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { loadYouTubeAPI } from "../src/lib/youtube.js";

test("YouTube API boot is shared and a blocked script can be retried", async () => {
  const dom = new JSDOM("<html><head></head><body></body></html>");
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  try {
    const first = loadYouTubeAPI();
    assert.equal(loadYouTubeAPI(), first);
    assert.equal(document.querySelectorAll("script").length, 1);
    document.querySelector("script").dispatchEvent(new window.Event("error"));
    await assert.rejects(first, /couldn’t load/);
    const retry = loadYouTubeAPI();
    assert.equal(document.querySelectorAll("script").length, 1);
    window.YT = { Player: class {} };
    window.onYouTubeIframeAPIReady();
    assert.equal(await retry, window.YT);
    assert.equal(await loadYouTubeAPI(), window.YT);
  } finally { dom.window.close(); }
});
