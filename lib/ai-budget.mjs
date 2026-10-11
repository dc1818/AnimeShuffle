// Shared site-wide reservations, made durably BEFORE a Workers AI request.
// Prices: developers.cloudflare.com/workers-ai/platform/pricing (2026-10-11).
export const EMBEDDING_MODEL = "@cf/baai/bge-small-en-v1.5";
export const TASTE_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const DAY = 86400000;
const rates = { [TASTE_MODEL]: [4119, 34868], [EMBEDDING_MODEL]: [1841, 0] };
export function createAiBudget({
  storage,
  ai,
  now = Date.now,
  dailyNeurons = 8000,
  dailyRequests = 40,
}) {
  const sql = storage.sql;
  // Hard ceilings keep an accidental environment-variable increase below the
  // documented free allowance. Other applications in the account are not measured.
  const cap = Math.max(0, Math.min(8000, Number(dailyNeurons) || 0));
  const requests = Math.max(0, Math.min(40, Number(dailyRequests) || 0));
  sql.exec(
    "CREATE TABLE IF NOT EXISTS ai_daily_budget (day INTEGER PRIMARY KEY, requests INTEGER NOT NULL, reserved REAL NOT NULL, paused INTEGER NOT NULL DEFAULT 0)",
  );
  function snapshot() {
    const day = Math.floor(now() / DAY);
    const row = Array.from(
      sql.exec("SELECT * FROM ai_daily_budget WHERE day=?", day),
    )[0];
    return {
      day,
      requestsToday: row?.requests || 0,
      reservedNeurons: row?.reserved || 0,
      dailyNeurons: cap,
      dailyRequests: requests,
      paused: !!row?.paused,
      resetsAt: (day + 1) * DAY,
      scope: "this-site",
      accounting: "conservative-reservations",
    };
  }
  return {
    diagnostics: snapshot,
    async run(model, input) {
      if (!ai?.run || !rates[model])
        throw Error("model binding missing or unsupported budget model");
      const output = model === EMBEDDING_MODEL ? 0 : Number(input.max_tokens);
      if (!Number.isSafeInteger(output) || output < 0 || output > 3600)
        throw Error("Invalid AI output budget");
      const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
      if (bytes > 64000) throw Error("AI input exceeds bounded evidence size");
      // One token per UTF-8 byte + framing, maximum output, and 2x headroom.
      // Failed/timed-out calls retain their whole reservation; never refund on guesses.
      const reserve = Math.ceil(
        (2 * ((bytes + 1024) * rates[model][0] + output * rates[model][1])) /
          1e6,
      );
      storage.transactionSync(() => {
        const s = snapshot();
        if (
          s.paused ||
          s.requestsToday >= requests ||
          s.reservedNeurons + reserve > cap
        )
          throw Object.assign(
            Error("daily free allocation reserved: site AI budget reached"),
            { code: 3036 },
          );
        sql.exec(
          "INSERT INTO ai_daily_budget VALUES (?,?,?,0) ON CONFLICT(day) DO UPDATE SET requests=requests+1,reserved=reserved+excluded.reserved",
          s.day,
          1,
          reserve,
        );
        sql.exec("DELETE FROM ai_daily_budget WHERE day<?", s.day - 7);
      });
      try {
        const result = await ai.run(model, input);
        if (result?.success === false || result?.errors?.length) {
          const e = result.errors?.[0] || {};
          throw Object.assign(Error(e.message || "model_error"), {
            code: e.code,
          });
        }
        return result;
      } catch (error) {
        if (
          Number(error?.code) === 3036 ||
          /3036|daily free allocation|neurons.*(?:exhaust|exceed)/i.test(
            String(error?.message),
          )
        )
          sql.exec(
            "UPDATE ai_daily_budget SET paused=1 WHERE day=?",
            Math.floor(now() / DAY),
          );
        throw error;
      }
    },
  };
}
