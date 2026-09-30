import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

// Keep the runnable build in the download: users can launch it without npm install.
// Developers edit src/, then rebuild. No application source is hand-edited in dist/.
await mkdir("dist", { recursive: true });
for (const legacy of ["recommend.js", "demo.js"])
  await rm(`dist/${legacy}`, { force: true });
await cp("public", "dist", { recursive: true });
await cp("src/styles.css", "dist/style.css");
await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outfile: "dist/app.js",
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: true,
  minify: true,
  legalComments: "linked",
});
console.log("React production build ready in dist/.");
