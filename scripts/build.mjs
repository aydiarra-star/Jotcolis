import { cp, mkdir, rm } from "node:fs/promises";

// Frontend statique : les scripts sont copiés tels quels ; aucun secret n'est injecté.
const files = [
  "index.html",
  "styles.css",
  "premium.css",
  "experience.css",
  "platform.css",
  "app.js",
  "platform.js",
  "journey-globe.js",
  "supabase-config.js",
];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await mkdir("dist/docs", { recursive: true });
for (const file of files) await cp(file, `dist/${file}`);
await cp("docs/AUDIT-ET-CHANTIER.md", "dist/docs/AUDIT-ET-CHANTIER.md");
console.log("JotColis built in dist/ (frontend, plateforme Supabase, styles et globe inclus).");
