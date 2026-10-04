import test from "node:test";
import assert from "node:assert/strict";
import { createCloudSync } from "../src/lib/cloud-sync.js";
const memory = () => {
  const map = new Map();
  return { getItem: (k) => map.get(k), setItem: (k, v) => map.set(k, v) };
};
test("sync merges independent device changes and retains failed writes for reload", async () => {
  const storage = memory();
  let remote = {
      revision: 0,
      reactions: {},
      settings: { autoAdd: false, dynamic: true },
      preferences: {},
      onboardingComplete: true,
    },
    offline = false,
    latest;
  const api = async (path, body) => {
    if (offline) throw Error("Offline");
    if (!body) return structuredClone(remote);
    if (body.revision !== remote.revision) {
      const error = Error("Conflict");
      error.code = "sync_conflict";
      throw error;
    }
    for (const { id, reaction } of body.changes) {
      if (reaction === null) delete remote.reactions[id];
      else remote.reactions[id] = reaction;
    }
    if (body.settings) remote.settings = body.settings;
    return { revision: ++remote.revision };
  };
  const options = {
    api,
    storage,
    key: "account-a",
    onRemote: (r) => (latest = r),
    onStatus: () => {},
  };
  let sync = createCloudSync(options);
  await sync.initialize();
  const first = { action: "watch", anime: { id: 1, title: "One" }, at: 10 };
  offline = true;
  sync.queue({ ...latest, reactions: { 1: first } });
  await assert.rejects(sync.flush());
  sync.dispose();
  remote.reactions[2] = {
    action: "good",
    anime: { id: 2, title: "Two" },
    at: 20,
  };
  remote.revision++;
  offline = false;
  sync = createCloudSync(options);
  await sync.initialize();
  assert.ok(remote.reactions[1]);
  assert.ok(remote.reactions[2]);
  remote.reactions[3] = {
    action: "bad",
    anime: { id: 3, title: "Three" },
    at: 30,
  };
  remote.revision++;
  sync.queue({ ...latest, reactions: { 2: latest.reactions[2] } });
  await sync.flush();
  assert.equal(remote.reactions[1], undefined);
  assert.ok(remote.reactions[3]);
  sync.dispose();
});

test("a slow background snapshot cannot erase a reaction acknowledged during the read", async () => {
  let release,
    delay = false,
    latest;
  let remote = {
    revision: 0,
    reactions: {},
    settings: {},
    preferences: {},
    onboardingComplete: true,
  };
  const sync = createCloudSync({
    storage: memory(),
    key: "race",
    onStatus() {},
    onRemote: (value) => {
      latest = value;
    },
    api: async (_path, body) => {
      if (body) {
        for (const { id, reaction } of body.changes)
          remote.reactions[id] = reaction;
        return { revision: ++remote.revision };
      }
      const snapshot = structuredClone(remote);
      if (delay)
        await new Promise((resolve) => {
          release = resolve;
        });
      return snapshot;
    },
  });
  await sync.initialize();
  delay = true;
  const background = sync.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  const reaction = { action: "watch", anime: { id: 1, title: "One" } };
  sync.queue({ reactions: { 1: reaction }, settings: {} });
  await sync.flush();
  const before = latest;
  release();
  await background;
  assert.equal(
    latest,
    before,
    "The old revision is not published over current local state",
  );
  assert.deepEqual(remote.reactions[1], reaction);
});

test("more than 100 queued account reactions are all flushed in bounded batches", async () => {
  const batches = [];
  let revision = 0;
  const saved = {};
  const sync = createCloudSync({
    storage: memory(),
    key: "many",
    onStatus() {},
    onRemote() {},
    api: async (_url, body) => {
      if (!body) return { revision, reactions: saved, settings: {} };
      assert.equal(body.revision, revision);
      batches.push(body.changes.length);
      for (const { id, reaction } of body.changes) saved[id] = reaction;
      return { revision: ++revision };
    },
  });
  await sync.initialize();
  sync.queue({
    settings: {},
    reactions: Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [
        i + 1,
        { action: "watch", anime: { id: i + 1 }, at: i },
      ]),
    ),
  });
  await sync.flush();
  assert.deepEqual(batches, [100, 100, 50]);
  assert.equal(Object.keys(saved).length, 250);
});
