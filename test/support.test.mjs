import test from "node:test";
import assert from "node:assert/strict";
import { supportDestination } from "../src/lib/support.js";

test("checkout uses the owner page and rejects unsafe destinations", () => {
  assert.deepEqual(supportDestination(), {
    url: "https://ko-fi.com/dc1818",
    provider: "Ko-fi",
  });
  for (const value of [
    "",
    "not a URL",
    "javascript:alert(1)",
    "http://ko-fi.com/example",
    "https://ko-fi.com/",
    "https://ko-fi.com.evil.test/example",
    "https://name:password@ko-fi.com/example",
    "https://ko-fi.com:8080/example",
  ]) {
    assert.equal(supportDestination(value), null, value);
  }
  assert.deepEqual(supportDestination("https://ko-fi.com/example"), {
    url: "https://ko-fi.com/example",
    provider: "Ko-fi",
  });
  assert.equal(
    supportDestination("https://www.buymeacoffee.com/example").provider,
    "Buy Me a Coffee",
  );
  assert.equal(
    supportDestination("https://paypal.me/example").provider,
    "PayPal",
  );
});
