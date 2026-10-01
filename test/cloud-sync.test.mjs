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
