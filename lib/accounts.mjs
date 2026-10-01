/**
 * Local account storage. Passwords use salted scrypt; plaintext passwords are
 * never written. Only this server's verified session chooses a preference key.
 * Atomic file replacement and a queue serialize updates within this local server.
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { AppError } from "./mal.mjs";
import { normalizePreferences } from "../src/lib/preferences.js";
const derive = promisify(scrypt);
const parameters = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const usernamePattern = /^[a-zA-Z0-9_]{3,24}$/;
const dummySalt = randomBytes(16).toString("hex");

export function createAccountStore(directory) {
  const file = path.join(directory, "accounts.json");
  let tail = Promise.resolve();
  // File-system failures need a useful UI message and a safe code in host logs.
  // Never put file contents, passwords, tokens, or full paths in these errors.
  function storageFailure(error, operation) {
    const failure = new AppError(
      operation === "write"
        ? "Account changes could not be saved because server storage is unavailable. Please ask the site owner to check storage permissions and free space."
        : "Server account storage could not be read. Please ask the site owner to check the account database.",
      503,
      "account_storage_unavailable",
    );
    failure.operation = operation;
    failure.storageCode = [
      "EACCES",
      "EPERM",
      "EROFS",
      "ENOSPC",
      "EDQUOT",
      "ENOTDIR",
      "EISDIR",
      "ENOENT",
    ].includes(error.code)
      ? error.code
      : error instanceof SyntaxError ||
          error.message === "Invalid account database"
        ? "INVALID_DATABASE"
        : "STORAGE_IO_ERROR";
    return failure;
  }
  async function read() {
    try {
      const data = JSON.parse(await readFile(file, "utf8"));
      if (
        data?.version !== 1 ||
        !Array.isArray(data.accounts) ||
        !data.preferences
      )
        throw Error("Invalid account database");
      return data;
    } catch (error) {
      // A malformed database must not be mistaken for an empty one and overwritten.
      if (error.code === "ENOENT")
        return { version: 1, accounts: [], preferences: {} };
      throw storageFailure(error, "read");
    }
  }
  async function write(data) {
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const temporary = file + "." + randomUUID() + ".tmp";
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      throw storageFailure(error, "write");
    }
  }
  function exclusive(work) {
    const next = tail.then(work);
    tail = next.catch(() => {});
    return next;
  }
  const publicAccount = (account) => ({
    id: account.id,
    name: account.username,
    provider: "local",
  });
  function credentials(username, password, registration) {
    if (typeof username !== "string" || !usernamePattern.test(username.trim()))
      throw new AppError(
        registration
          ? "Use 3–24 letters, numbers or underscores for your username."
          : "Incorrect username or password.",
        registration ? 400 : 401,
      );
    if (
      typeof password !== "string" ||
      password.length > 128 ||
      password.length < (registration ? 12 : 1)
    )
      throw new AppError(
        registration
          ? "Use a password between 12 and 128 characters."
          : "Incorrect username or password.",
        registration ? 400 : 401,
      );
    return username.trim();
  }
  return {
    register(username, password) {
      return exclusive(async () => {
        username = credentials(username, password, true);
        const data = await read();
        const key = username.toLowerCase();
        if (data.accounts.some((account) => account.key === key))
          throw new AppError("That username is already taken.", 409);
        const salt = randomBytes(16).toString("hex");
        const hash = (await derive(password, salt, 64, parameters)).toString(
          "hex",
        );
        const account = {
          id: "local:" + randomUUID(),
          username,
          key,
          salt,
          hash,
        };
        data.accounts.push(account);
        await write(data);
        return publicAccount(account);
      });
    },
    login(username, password) {
      return exclusive(async () => {
        username = credentials(username, password, false);
        const data = await read();
        const account = data.accounts.find(
          (account) => account.key === username.toLowerCase(),
        );
        // Unknown users incur the same expensive derivation as incorrect passwords.
        const actual = await derive(
          password,
          account?.salt || dummySalt,
          64,
          parameters,
        );
        const expected = account
          ? Buffer.from(account.hash, "hex")
          : Buffer.alloc(64);
        if (
          !account ||
          expected.length !== actual.length ||
          !timingSafeEqual(expected, actual)
        )
          throw new AppError("Incorrect username or password.", 401);
        return publicAccount(account);
      });
    },
    async preferences(accountId) {
      await tail;
      const data = await read();
      const saved = data.preferences[accountId];
      return {
        preferences: normalizePreferences(saved?.preferences),
        onboardingComplete: saved?.onboardingComplete === true,
      };
    },
    savePreferences(accountId, preferences) {
      return exclusive(async () => {
        const data = await read();
        const saved = {
          preferences: normalizePreferences(preferences),
          onboardingComplete: true,
        };
        data.preferences[accountId] = saved;
        await write(data);
        return saved;
      });
    },
  };
}

/** Shared per-server rate limiter, so clearing a session cookie cannot bypass it. */
export function createLoginLimiter({
  limit = 20,
  windowMs = 15 * 60 * 1000,
} = {}) {
  let start = Date.now(),
    count = 0;
  return () => {
    if (Date.now() - start >= windowMs) {
      start = Date.now();
      count = 0;
    }
    if (++count > limit)
      throw new AppError(
        "Too many sign-in attempts. Try again in 15 minutes.",
        429,
      );
  };
}
