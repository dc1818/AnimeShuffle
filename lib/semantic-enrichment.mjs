import { EMBEDDING_MODEL } from "./ai-budget.mjs";
import { evidencePackage } from "./catalog-model.mjs";
export const SEMANTIC_VERSION = "bge-evidence-1";
const normalizedMean = (rows) => {
  if (!rows.length) return null;
  const values = Array.from(
    { length: 384 },
    (_, i) => rows.reduce((sum, r) => sum + r[i], 0) / rows.length,
  );
  const norm = Math.hypot(...values);
  return norm > 0 ? values.map((v) => Number((v / norm).toFixed(5))) : null;
};
export function createSemanticAnalyzer(ai) {
  if (!ai?.run) return null;
  return async (anime, reviews) => {
    const evidence = evidencePackage(anime, reviews);
    // English short chunks, separate premise and review representations. No raw
    // review text, user IDs, votes, notes or private lists are saved or sent.
    const rows = [];
    for (const source of ["premise", "review"]) {
      const passages = evidence.sentences.filter(
        (s) => s.source === source && !s.containsSpoilers,
      );
      let added = 0;
      for (const passage of passages) {
        const words = passage.text.split(/\s+/);
        let chunk = "";
        for (const word of words) {
          if (chunk.length + word.length > 350) {
            if (chunk) {
              rows.push({ source, text: chunk });
              added++;
            }
            chunk = "";
          }
          if (added >= 12) break;
          chunk += (chunk ? " " : "") + word.slice(0, 350);
        }
        if (chunk && added < 12) {
          rows.push({ source, text: chunk });
          added++;
        }
        if (added >= 12) break;
      }
    }
    if (!rows.length) return null;
    const result = await ai.run(EMBEDDING_MODEL, {
      text: rows.map((r) => r.text),
    });
    const data = result?.data;
    if (
      !Array.isArray(data) ||
      data.length !== rows.length ||
      data.some(
        (v) =>
          !Array.isArray(v) ||
          v.length !== 384 ||
          v.some((n) => !Number.isFinite(n)),
      )
    )
      throw Error("Invalid embedding response");
    return {
      version: SEMANTIC_VERSION,
      model: EMBEDDING_MODEL,
      premise: normalizedMean(
        data.filter((_, i) => rows[i].source === "premise"),
      ),
      review: normalizedMean(
        data.filter((_, i) => rows[i].source === "review"),
      ),
    };
  };
}
