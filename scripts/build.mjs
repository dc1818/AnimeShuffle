import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile } from "node:fs/promises";

// Keep the runnable build in the download: users can launch it without npm install.
// Developers edit src/, then rebuild. No application source is hand-edited in dist/.
const pages = process.argv.includes("--pages");
const output = pages ? "docs" : "dist";
await mkdir(output, { recursive: true });
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
  outfile: `${output}/app.js`,
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
