import { readFile } from "node:fs/promises";
import { validateResearchBundle } from "../lib/research-profiles.mjs";
import { splitResearchUpload } from "../src/lib/research-upload.js";
const path = process.argv[2];
if (!path) throw Error("Supply a completed research JSON file.");
const bundle = validateResearchBundle(JSON.parse(await readFile(path, "utf8")));
const chunks = splitResearchUpload(bundle);
console.log(
  JSON.stringify(
    {
      valid: true,
      profiles: bundle.profiles.length,
      requestChunks: chunks.length,
      assessedTraits: bundle.profiles.reduce(
        (n, p) => n + p.observations.filter((o) => o.score !== null).length,
        0,
      ),
      reusableDimensions: bundle.profiles.reduce(
        (n, p) => n + p.dimensions.length,
        0,
      ),
      note: "Format validation is not an accuracy or enrichment guarantee. Use Admin preview to check merges against current saved evidence.",
    },
    null,
    2,
  ),
);
