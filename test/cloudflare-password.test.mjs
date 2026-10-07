import test from "node:test";
import assert from "node:assert/strict";
import { pbkdf2Sync } from "node:crypto";
import { createPasswordHasher } from "../cloudflare/password-hash.mjs";

test("hosted PBKDF2 rejection falls back without changing existing password hashes", () => {
  let attempts = 0;
  const reports = [];
  const hash = createPasswordHasher(
    (password, salt, iterations) => {
      attempts++;
      assert.equal(iterations, 600000);
      throw new DOMException(
        "Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000)",
        "NotSupportedError",
      );
    },
    (...args) => reports.push(args),
  );
  for (const [password, salt] of [
    ["existing account password", "saved-account-salt"],
    ["パスワード🔐 café e\u0301", "unicode-salt-塩"],
    ["x".repeat(127) + "\ud800", "unknown-account-salt"],
  ]) {
    // Independent native implementation represents hashes already in SQLite.
    const existing = pbkdf2Sync(password, salt, 600000, 32, "sha256").toString(
      "hex",
    );
    assert.equal(hash(password, salt), existing);
  }
  assert.equal(
    attempts,
    1,
    "unsupported native calls are not retried for every visitor",
  );
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0], [
    "[cloud-password-hash]",
    "native_pbkdf2_unsupported",
    {
      iterations: 600000,
      algorithm: "sha256",
      implementation: "noble",
    },
  ]);
});

test("supported native hashing remains compatible and does not log", () => {
  const hash = createPasswordHasher(pbkdf2Sync, () =>
    assert.fail("unexpected fallback"),
  );
  assert.equal(
    hash("correct password", "test salt"),
    pbkdf2Sync("correct password", "test salt", 600000, 32, "sha256").toString(
      "hex",
    ),
  );
});

test("unrelated native failures are propagated without fallback", () => {
  const failure = new Error("unrelated crypto failure");
  const hash = createPasswordHasher(
    () => {
      throw failure;
    },
    () => assert.fail("unexpected fallback"),
  );
  assert.throws(
    () => hash("password", "salt"),
    (error) => error === failure,
  );
});
