import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";

// Keep the runnable build in the download: users can launch it without npm install.
// Developers edit src/, then rebuild. No application source is hand-edited in dist/.
const pages = process.argv.includes("--pages");
const output = pages ? "docs" : "dist";
await mkdir(output, { recursive: true });
await rm(`${output}/chunks`, { recursive: true, force: true });
for (const legacy of ["recommend.js", "demo.js"])
  await rm(`${output}/${legacy}`, { force: true });
await cp("public", output, { recursive: true });
await cp("src/styles.css", `${output}/style.css`);
if (pages) {
  // Explicit build marker: the demo never attempts same-origin server API calls.
  const html = await readFile(`${output}/index.html`, "utf8");
  await writeFile(
    `${output}/index.html`,
    html.replace('<html lang="en">', '<html lang="en" data-hosting="pages">'),
  );
  await writeFile(`${output}/.nojekyll`, "");
}
await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outdir: output,
  entryNames: "app",
  chunkNames: "chunks/[name]-[hash]",
  splitting: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: true,
  minify: true,
  legalComments: "linked",
});
console.log(`React production build ready in ${output}/.`);
// The isolated layout fixture uses the real components at phone/tablet/desktop
// viewport widths, without touching accounts or sending test reactions.
await build({
  entryPoints: ["test/fixtures/feedback-preview.jsx"],
  bundle: true,
  outfile: `${output}/feedback-preview.js`,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
});

// Standalone same-origin worker keeps Watchlist ranking off the UI thread.
await build({
  entryPoints: ["src/lib/watchlist-worker.js"],
  outfile: `${output}/watchlist-worker.js`,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  minify: true,
});
