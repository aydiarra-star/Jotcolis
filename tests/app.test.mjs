import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const html = await read("../index.html");
const appJs = await read("../app.js");
const platformJs = await read("../platform.js");
const styles = await read("../styles.css");
const premium = await read("../premium.css");
const experience = await read("../experience.css");
const platformCss = await read("../platform.css");
const config = await read("../supabase-config.js");
const buildScript = await read("../scripts/build.mjs");
const renderBlueprint = await read("../render.yaml");
const ci = await read("../.github/workflows/ci.yml");
const globeJs = await read("../journey-globe.js");
const frontend = html + appJs + platformJs + config;

test("page française, accessible et identité visuelle préservée", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<link rel="stylesheet" href="\.\/platform\.css">/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media/);
  assert.match(experience, /--jc-orange: #f47721/);
  assert.match(experience, /--jc-ink: #242326/);
  assert.match(experience, /prefers-reduced-motion: reduce/);
  assert.match(premium, /--jc-orange:#f47721/);
  assert.match(platformCss, /var\(--ink/);
  assert.match(platformCss, /@media \(max-width: 820px\)/);
  assert.match(platformCss, /:focus-visible/);
});

test("aucune donnée de démonstration ni faux suivi n'est présenté comme réel", () => {
  assert.doesNotMatch(html, /id="demo-banner"|Données de démonstration/);
  assert.doesNotMatch(html, /JC-EXEMPLE-2048|JC-4829/);
  assert.doesNotMatch(html, /Place confirmée avec le voyageur|Colis vérifié et remis au GP/);
  assert.doesNotMatch(html, /GP vérifiés<\/strong>|Pièce d’identité et téléphone contrôlés/);
  assert.doesNotMatch(html, /Le destinataire reçoit un code à présenter à la livraison/);
  assert.doesNotMatch(appJs, /starterTrips|jotcolis-demo-trips-v1|jotcolis-gp-alerts-v1|localStorage/);
  assert.doesNotMatch(platformJs, /localStorage/);
  assert.doesNotMatch(frontend, /JC-EXEMPLE-2048|JC-4829/);
  assert.match(appJs, /Aucun exemple fictif n’est présenté comme une offre/);
  assert.match(appJs, /Aucun e-mail ni message WhatsApp n’est envoyé/);
  assert.match(platformJs, /Aucun envoi n’est confirmé ici/);
});

test("tous les parcours exposés sont branchés sur des formulaires ou actions serveur", () => {
  for (const form of [
    "search-trips", "create-trip", "track-parcel", "submit-request",
    "signup", "signin", "forgot-password", "reset-password", "profile",
  ]) {
    assert.match(frontend, new RegExp(`data-form="${form}"|case "${form}"`), `${form} doit être branché`);
  }
  for (const id of ["auth-status", "compliance-banner", "profile-panel", "dashboard-root", "parcel-track-results", "contact-gp-feedback"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(platformJs, /resetPasswordForEmail/);
  assert.match(platformJs, /onAuthStateChange/);
  assert.match(platformJs, /PASSWORD_RECOVERY/);
  assert.match(platformJs, /updateUser\(\{ password/);
  assert.match(platformJs, /signOut\(\)/);
  assert.match(platformJs, /get_my_state/);
  assert.match(platformJs, /admin_overview/);
  assert.doesNotMatch(html, /href="#"/);
});

test("la recherche et la publication utilisent les RPC serveur, jamais le stockage navigateur", () => {
  assert.match(platformJs, /rpc\("search_trips"/);
  assert.match(platformJs, /rpc\("create_trip_draft"/);
  assert.match(platformJs, /rpc\("publish_my_trip"/);
  assert.match(platformJs, /rpc\("submit_parcel_request"/);
  assert.match(platformJs, /rpc\("get_parcel_passport"/);
  assert.match(platformJs, /rpc\("create_trip_alert"/);
  assert.match(appJs, /data-form="trip-alert"/);
  assert.match(platformJs, /Aucun exemple fictif n’est affiché/);
  assert.match(platformJs, /Alerte enregistrée en base/);
});

test("le frontend ne contient aucun secret ni clé service_role", () => {
  assert.match(config, /sb_publishable_/);
  assert.match(config, /Ne jamais ajouter de clé service_role/);
  assert.doesNotMatch(frontend, /service_role\s*[:=]\s*['"][^'"]+|SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"]|sb_secret_|sk_live_/i);
  assert.match(config, /window\.JOTCOLIS_CONFIG/);
  assert.match(html, /supabase-config\.js/);
  assert.match(html, /platform\.js/);
});

test("le build, la CI et le blueprint statique incluent les nouveaux fichiers sans déploiement automatique déclaré", () => {
  for (const file of ["platform.css", "platform.js", "app.js", "journey-globe.js", "supabase-config.js", "docs/AUDIT-ET-CHANTIER.md"]) {
    assert.match(buildScript, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `${file} doit être copié dans dist/`);
  }
  assert.match(ci, /npm ci/);
  assert.match(ci, /npm test/);
  assert.match(ci, /branches:\s*\n\s*- "\*\*"/);
  assert.match(renderBlueprint, /npm ci && npm test && npm run build/);
  assert.doesNotMatch(renderBlueprint, /previews:/);
});

test("le globe illustratif et les composants visuels restent clairement non opérationnels", () => {
  assert.match(html, /Animation illustrative · aucun suivi GPS/);
  assert.match(html, /id="world-canvas"/);
  assert.match(globeJs, /greatCirclePoint/);
  assert.match(globeJs, /prefers-reduced-motion/);
  assert.match(html, /\.\/journey-globe\.js/);
  assert.match(buildScript, /journey-globe\.js/);
});

test("aucune couleur hors palette ne subsiste dans les feuilles de style historiques", () => {
  const allowed = new Set([
    "#232225", "#242326", "#555555", "#555",
    "#f47721", "#df5d0b", "#c65308", "#b94c08", "#9a430d",
    "#fff0e3", "#fff5ed", "#fffaf6", "#ffffff", "#fff",
    "#eee7e1", "#fd9448", "#f67f2d", "#cc5a10", "#ec711d", "#f7e4d8",
    "#a43e3e",
  ]);
  for (const [name, source] of [["styles.css", styles], ["premium.css", premium], ["experience.css", experience]]) {
    const colors = source.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const outside = [...new Set(colors.filter((color) => !allowed.has(color.toLowerCase())))];
    assert.deepEqual(outside, [], `${name} contient des couleurs hors palette : ${outside.join(", ")}`);
  }
});
