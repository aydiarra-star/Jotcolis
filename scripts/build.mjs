import { cp, mkdir, rm } from "node:fs/promises";

// Keep the visual system and interactive globe alongside the existing static app.
const files = ["index.html", "styles.css", "premium.css", "experience.css", "app.js", "journey-globe.js", "supabase-config.js"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of files) await cp(file, `dist/${file}`);
console.log("JotColis static preview built in dist/ (styles and interactive globe included).");
