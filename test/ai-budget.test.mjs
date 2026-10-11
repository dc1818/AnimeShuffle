import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  createAiBudget,
  TASTE_MODEL,
  EMBEDDING_MODEL,
} from "../lib/ai-budget.mjs";
function storage() {
  const db = new DatabaseSync(":memory:");
  return {
    db,
    sql: {
      exec(q, ...a) {
        const s = db.prepare(q);
        if (s.columns().length) return s.all(...a);
        s.run(...a);
        return [];
      },
    },
    transactionSync(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
const input = {
  messages: [{ role: "user", content: "An anime synopsis." }],
  max_tokens: 100,
};
test("shared AI budget reserves before concurrent calls, survives restart, counts failures and resets at UTC midnight", async () => {
  const s = storage();
  let calls = 0,
    clock = 86400000 + 10;
  const ai = {
    async run() {
      calls++;
      throw Error("network failure");
    },
  };
  const options = { storage: s, ai, now: () => clock, dailyRequests: 2 };
  let b = createAiBudget(options);
  const r = await Promise.allSettled([
    b.run(TASTE_MODEL, input),
    b.run(EMBEDDING_MODEL, { text: ["anime"] }),
    b.run(TASTE_MODEL, input),
  ]);
  assert.equal(calls, 2);
  assert.equal(r[2].reason.code, 3036);
  assert.equal(b.diagnostics().requestsToday, 2);
  const reserved = b.diagnostics().reservedNeurons;
  assert.ok(reserved > 0);
  b = createAiBudget(options);
  await assert.rejects(b.run(TASTE_MODEL, input), { code: 3036 });
  assert.equal(b.diagnostics().reservedNeurons, reserved);
  clock = 2 * 86400000;
  await assert.rejects(b.run(TASTE_MODEL, input), /network/);
  assert.equal(calls, 3);
  assert.equal(b.diagnostics().requestsToday, 1);
  s.db.close();
});
test("neuron cap blocks an oversized reservation without calling provider; quota errors persist a pause", async () => {
  const s = storage();
  let calls = 0;
  const ai = {
    async run() {
      calls++;
      throw Object.assign(Error("daily free allocation exhausted"), {
        code: 3036,
      });
    },
  };
  const tiny = createAiBudget({ storage: s, ai, dailyNeurons: 1 });
  await assert.rejects(tiny.run(TASTE_MODEL, input), { code: 3036 });
  assert.equal(calls, 0);
  const b = createAiBudget({ storage: s, ai });
  await assert.rejects(b.run(TASTE_MODEL, input));
  assert.equal(calls, 1);
  await assert.rejects(
    createAiBudget({ storage: s, ai }).run(EMBEDDING_MODEL, {
      text: ["small"],
    }),
    { code: 3036 },
  );
  assert.equal(calls, 1);
  await assert.rejects(b.run("unknown-model", input), /unsupported/);
  s.db.close();
});
