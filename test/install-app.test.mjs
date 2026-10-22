import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createInstallController,
  registerAppWorker,
} from "../src/lib/install-app.js";

function browser(installed = false) {
  const win = new EventTarget();
  const display = new EventTarget();
  display.matches = installed;
  win.matchMedia = () => display;
  win.navigator = {};
  return win;
}
function offer(win, outcome = "dismissed") {
  const event = new Event("beforeinstallprompt", { cancelable: true });
  let calls = 0;
  event.prompt = async () => {
    calls++;
  };
  event.userChoice = Promise.resolve({ outcome });
  win.dispatchEvent(event);
  assert.ok(event.defaultPrevented, "no unsolicited installation dialog");
  return () => calls;
}
test("install prompt requires a click, is single-use and can be offered again", async () => {
  const win = browser();
  const controller = createInstallController(win);
  const calls = offer(win);
  assert.equal(calls(), 0);
  assert.equal(controller.getSnapshot().canInstall, true);
  await Promise.all([controller.install(), controller.install()]);
  assert.equal(calls(), 1);
  assert.equal(controller.getSnapshot().installed, false);
  assert.equal(controller.getSnapshot().canInstall, false);
  const accepted = offer(win, "accepted");
  await controller.install();
  assert.equal(accepted(), 1);
  assert.equal(controller.getSnapshot().installed, false);
  win.dispatchEvent(new Event("appinstalled"));
  assert.equal(controller.getSnapshot().installed, true);
  assert.equal(controller.getSnapshot().message, "");
});
test("standalone launch hides installation and unsupported/failed prompts degrade safely", async () => {
  assert.equal(
    createInstallController(browser(true)).getSnapshot().installed,
    true,
  );
  const win = browser();
  const controller = createInstallController(win);
  await controller.install();
  const event = new Event("beforeinstallprompt");
  event.prompt = async () => {
    throw Error("unsupported");
  };
  win.dispatchEvent(event);
  await controller.install();
  assert.equal(controller.getSnapshot().busy, false);
  assert.match(controller.getSnapshot().message, /browser/);
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
