import test from "node:test";
import assert from "node:assert/strict";
import { listNextOffset, listPageSize } from "../lib/mal.mjs";
test("larger list pages follow the real upstream cursor, including clamped pages", () => {
  assert.equal(listPageSize, 500);
  for (const next of [100, 500]) assert.equal(listNextOffset({ paging: { next: `https://api.myanimelist.net/v2/users/@me/animelist?offset=${next}` } }, 0), next);
  assert.equal(listNextOffset({ paging: {} }, 500), null);
  for (const next of ["0", "-1", "bad", "100001"]) assert.throws(() => listNextOffset({ paging: { next: `https://api.myanimelist.net/v2/users/@me/animelist?offset=${next}` } }, 0));
  assert.throws(() => listNextOffset({ paging: { next: "https://untrusted.test/?offset=500" } }, 0));
});
