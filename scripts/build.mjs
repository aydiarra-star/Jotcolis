import { cp, mkdir, rm } from "node:fs/promises";

const files = ["index.html", "styles.css", "app.js", "supabase-config.js"];
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const file of files) await cp(file, `dist/${file}`);
console.log("JotColis static preview built in dist/");
