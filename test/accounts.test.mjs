import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAccountStore, createLoginLimiter } from "../lib/accounts.mjs";

test("local accounts persist with salted hashes; login and preferences stay isolated", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "anime-accounts-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const db = createAccountStore(directory),
    password = "A long testing passphrase";
  const first = await db.register("Viewer_One", password);
  const second = await db.register("Viewer_Two", password);
  assert.equal(first.provider, "local");
  assert.equal(first.hash, undefined);
  const disk = await readFile(path.join(directory, "accounts.json"), "utf8");
  assert.ok(!disk.includes(password));
  const records = JSON.parse(disk).accounts;
  assert.notEqual(records[0].hash, records[1].hash);
  assert.notEqual(records[0].salt, records[1].salt);
  await assert.rejects(db.register("viewer_one", password), /taken/);
  await assert.rejects(db.register("bad", "short"), /12 and 128/);
  await assert.rejects(
    db.login("viewer_one", "wrong password"),
    /Incorrect username or password/,
  );
  await assert.rejects(
    db.login("no_such_user", password),
    /Incorrect username or password/,
  );
  const reopened = createAccountStore(directory);
  assert.equal((await reopened.login("VIEWER_ONE", password)).id, first.id);
  await reopened.savePreferences(first.id, {
    formats: ["movies"],
    finishedOnly: true,
  });
  assert.deepEqual((await db.preferences(first.id)).preferences.formats, [
    "movies",
  ]);
  assert.equal((await db.preferences(second.id)).onboardingComplete, false);
});
test("login limiter counts attempts independently of browser sessions", () => {
  const check = createLoginLimiter({ limit: 2 });
  check();
  check();
  assert.throws(check, (error) => error.status === 429);
});

test("storage failures are actionable and malformed account data is never overwritten", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "anime-storage-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "accounts.json");
  await writeFile(file, "malformed database");
  const store = createAccountStore(directory);
  await assert.rejects(
    store.savePreferences("mal:7", {}),
    (e) =>
      e.status === 503 &&
      e.code === "account_storage_unavailable" &&
      e.storageCode === "INVALID_DATABASE",
  );
  assert.equal(await readFile(file, "utf8"), "malformed database");
  // A file where a directory is expected reliably reproduces a storage fault on all platforms.
  const invalid = createAccountStore(file);
  await assert.rejects(
    invalid.savePreferences("mal:7", {}),
    (e) => e.status === 503 && e.code === "account_storage_unavailable",
  );
});
