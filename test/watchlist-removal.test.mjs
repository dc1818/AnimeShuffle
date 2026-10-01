import test from "node:test";
import assert from "node:assert/strict";
import { removeMalPlan } from "../lib/watchlist-removal.mjs";

test("MAL removal requires confirmation and rechecks status without deleting progressed entries", async () => {
  let status = { status: "plan_to_watch", updated_at: "2026-10-01T12:00:00Z" },
    deletes = 0;
  const mal = {
    async request(path, options) {
      if (options.method === "DELETE") {
        deletes++;
        status = undefined;
        return;
      }
      return { my_list_status: status };
    },
  };
  assert.deepEqual(await removeMalPlan(mal, {}, 1), {
    confirmationRequired: true,
  });
  assert.equal(deletes, 0);
  status = { status: "watching" };
  await assert.rejects(
    removeMalPlan(mal, {}, 1, true),
    /no longer Plan to Watch/,
  );
  assert.equal(deletes, 0);
  status = { status: "plan_to_watch" };
  assert.deepEqual(await removeMalPlan(mal, {}, 1, true), { removed: true });
  assert.equal(deletes, 1);
  assert.deepEqual(await removeMalPlan(mal, {}, 1, true), { removed: true });
  assert.equal(deletes, 1);
});
