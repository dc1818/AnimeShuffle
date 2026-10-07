import { pbkdf2Sync } from "node:crypto";
import { pbkdf2 } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

const ITERATIONS = 600000;
const KEY_BYTES = 32;

/** Preserve the existing SHA-256/600,000-round hash and UTF-8/hex encoding.
 * Hosted Workers may reject the native iteration count even when local workerd
 * accepts it. The portable implementation computes the SAME PBKDF2 result;
 * lowering the count or chaining separate derivations would break old accounts.
 */
export function createPasswordHasher(
  native = pbkdf2Sync,
  report = (...args) => console.warn(...args),
) {
  let nativeSupported = true;
  return function passwordHash(password, salt) {
    if (nativeSupported) {
      try {
        return native(password, salt, ITERATIONS, KEY_BYTES, "sha256").toString(
          "hex",
        );
      } catch (error) {
        // Never conceal other crypto failures or silently lower the work factor.
        if (error?.name !== "NotSupportedError") throw error;
        nativeSupported = false;
        // No passwords, salts, keys, or account identifiers in diagnostics.
        report("[cloud-password-hash]", "native_pbkdf2_unsupported", {
          iterations: ITERATIONS,
          algorithm: "sha256",
          implementation: "noble",
        });
      }
    }
    const passwordBytes = Buffer.from(password, "utf8");
    const saltBytes = Buffer.from(salt, "utf8");
    let derived;
    try {
      derived = pbkdf2(sha256, passwordBytes, saltBytes, {
        c: ITERATIONS,
        dkLen: KEY_BYTES,
      });
      return Buffer.from(derived).toString("hex");
    } finally {
      passwordBytes.fill(0);
      saltBytes.fill(0);
      derived?.fill(0);
    }
  };
}

export const passwordHash = createPasswordHasher();
