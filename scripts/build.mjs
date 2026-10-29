import { cp, mkdir, rm } from "node:fs/promises";

// premium.css is loaded by index.html and must be present in the published dist folder.
const files = ["index.html", "styles.css", "premium.css", "app.js", "supabase-config.js"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of files) await cp(file, `dist/${file}`);
console.log("JotColis static preview built in dist/ (including premium.css).");
