import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  shouldOfferAndroidApp,
  rememberWebsiteChoice,
  suppressBrowserInstall,
  registerAppWorker,
  ANDROID_CHOICE_KEY,
} from "../src/lib/install-app.js";

function browser(userAgent, standalone = false) {
  const win = new EventTarget();
  win.matchMedia = () => ({ matches: standalone });
  win.navigator = { userAgent };
  win.document = { documentElement: { dataset: {} } };
  const values = new Map();
  win.localStorage = {
    getItem: (key) => values.get(key),
    setItem: (key, value) => values.set(key, value),
  };
  return win;
}
test("APK invitation is limited to Android phones and remembers the website choice", () => {
  const android = browser(
    "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36",
  );
  assert.equal(shouldOfferAndroidApp(android), true);
  for (const ua of [
    "iPhone Mobile Safari",
    "Windows NT 10 Chrome",
    "Linux Android 14 Chrome Safari",
  ]) {
    assert.equal(shouldOfferAndroidApp(browser(ua)), false);
  }
  assert.equal(shouldOfferAndroidApp(browser("Android Mobile", true)), false);
  android.document.documentElement.dataset.hosting = "pages";
  assert.equal(shouldOfferAndroidApp(android), false);
  delete android.document.documentElement.dataset.hosting;
  android.localStorage.setItem(ANDROID_CHOICE_KEY, "website");
  assert.equal(shouldOfferAndroidApp(android), false);
  const blockedStorage = browser("Android Mobile");
  blockedStorage.localStorage = {
    getItem() {
      throw Error();
    },
    setItem() {
      throw Error();
    },
  };
  assert.equal(shouldOfferAndroidApp(blockedStorage), true);
  rememberWebsiteChoice(blockedStorage);
  assert.equal(shouldOfferAndroidApp(blockedStorage), false);
});
test("website suppresses browser-install offers and never triggers their prompt", () => {
  const win = browser("Android Mobile");
  suppressBrowserInstall(win);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  event.prompt = () => assert.fail("PWA installation should not be offered");
  win.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});
test("worker registration uses same origin and skips insecure/static environments", async () => {
  const calls = [];
  const win = {
    isSecureContext: true,
    document: { documentElement: { dataset: {} } },
    navigator: {
      serviceWorker: {
        register: async (...args) => {
          calls.push(args);
          throw Error("disabled");
        },
      },
    },
  };
  registerAppWorker(win);
  await Promise.resolve();
  assert.deepEqual(calls[0], [
    "/sw.js",
    { scope: "/", updateViaCache: "none" },
  ]);
  win.document.documentElement.dataset.hosting = "pages";
  registerAppWorker(win);
  delete win.document.documentElement.dataset.hosting;
  win.isSecureContext = false;
  registerAppWorker(win);
  assert.equal(calls.length, 1);
});
test("manifest has Android-sized PNGs, safe maskable artwork and same-origin launch", async () => {
  const manifest = JSON.parse(
    await readFile("public/manifest.webmanifest", "utf8"),
  );
  const origin = "https://animeshuffle.com/";
  assert.equal(new URL(manifest.start_url, origin).href, origin);
  assert.equal(new URL(manifest.scope, origin).href, origin);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);
  for (const icon of manifest.icons) {
    const bytes = await readFile("public/" + icon.src);
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
    assert.equal(
      `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`,
      icon.sizes,
    );
  }
  assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
  assert.ok(
    manifest.icons.some(
      (i) => i.sizes === "512x512" && i.purpose === "maskable",
    ),
  );
});
