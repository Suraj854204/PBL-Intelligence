// Bundles the Express app into api/index.js (one self-contained Vercel serverless function).
// A pre-built api/index.js is committed, so if bundling ever fails the deploy still works with the committed copy.
import { build } from "esbuild";
import fs from "node:fs";

try {
  await build({
    entryPoints: ["server/vercel-entry.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    outfile: "api/index.js",
    banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
    logLevel: "info",
  });
} catch (e) {
  if (fs.existsSync("api/index.js")) {
    console.warn("WARNING: API bundling failed; keeping the committed api/index.js.\n", e?.message ?? e);
  } else {
    console.error("API bundling failed and no api/index.js exists.", e);
    process.exit(1);
  }
}
