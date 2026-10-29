import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const experienceCss = await readFile(new URL("../experience.css", import.meta.url), "utf8");
const globeJs = await readFile(new URL("../journey-globe.js", import.meta.url), "utf8");
const buildScript = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");

test("landing page declares French and mobile viewport", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /name="viewport"/);
});

test("demo labels sample routes as fictitious and discloses local-only storage", () => {
  assert.match(html, /DÉMONSTRATION/);
  assert.match(html, /Données fictives/);
  assert.match(html, /Ces exemples sont fictifs/);
  assert.match(js, /jotcolis-demo-trips-v1/);
  assert.match(js, /Aucun trajet réel consulté/);
  assert.match(js, /Aucun autre utilisateur ne le voit/);
});

test("search and GP trip forms have accessible feedback", () => {
  assert.match(html, /id="origin"/);
  assert.match(html, /id="destination"/);
  assert.match(html, /id="trip-form"/);
  assert.match(html, /aria-live="polite"/);
  assert.ok(js.includes('addEventListener("submit"'));
});

test("trip demo validates capacity and escapes user-provided city names", () => {
  assert.match(js, /capacity < 1 \|\| capacity > 100/);
  assert.match(js, /function escapeHtml/);
  assert.match(js, /localStorage\.setItem/);
});

test("stylesheet includes keyboard focus and responsive layout", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media/);
  assert.match(css, /\.trip-results/);
});


test("international corridor shortcuts cover Spain, Italy, the United States and the UAE", () => {
  assert.match(html, /Espagne → Sénégal/);
  assert.match(html, /Italie → Sénégal/);
  assert.match(html, /États-Unis → Sénégal/);
  assert.match(html, /Émirats arabes unis → Sénégal/);
  assert.match(js, /\.corridor-card/);
  assert.match(js, /aucune disponibilité réelle n’est consultée/i);
});


test("Supabase account flows use only a publishable browser key and expose clear session UI", () => {
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="signin-form"/);
  assert.match(html, /id="signout-button"/);
  assert.match(html, /supabase-config\.js/);
  assert.match(js, /signUp\(/);
  assert.match(js, /signInWithPassword\(/);
  assert.match(js, /auth\.signOut\(/);
  assert.match(js, /publishableKey/);
  assert.match(html, /publication des trajets, les réservations et les paiements ne sont pas encore activés/);
});


test("browser Supabase configuration is public-only and auth forms can be hidden after login", async () => {
  const config = await readFile(new URL("../supabase-config.js", import.meta.url), "utf8");
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /service_role|secret_key/i);
  assert.match(css, /\.auth-card\[hidden\].*display:none!important/);
});


test("connected search queries only future published trips on active corridors", () => {
  assert.match(js, /window\.JOTCOLIS_SUPABASE = client/);
  assert.match(js, /from\("trips"\)/);
  assert.match(js, /\.eq\("status", "published"\)/);
  assert.match(js, /\.eq\("corridors\.is_active", true\)/);
  assert.match(js, /\.gte\("departure_at", new Date\(\)\.toISOString\(\)\)/);
  assert.match(js, /Aucun trajet réel publié/);
  assert.match(js, /Aucun exemple fictif n’est présenté comme une offre réelle/);
  assert.match(js, /Réservation non activée/);
});


test("premium identity layers midnight blue and gold over the legacy palette with motion and focus support", () => {
  assert.match(css, /--teal:#f47721/);
  assert.match(experienceCss, /--jc-night: #07111d/);
  assert.match(experienceCss, /--jc-gold: #d5b36b/);
  assert.match(experienceCss, /\.mobile-bottom-nav a \{[^}]*min-height: 48px/s);
  assert.match(experienceCss, /prefers-reduced-motion: reduce/);
  assert.match(experienceCss, /button:focus-visible/);
});


test("landing copy avoids promising unavailable booking or fabricated inventory", () => {
  assert.match(html, /Aucune fausse disponibilité/);
  assert.match(html, /Statuts et limites visibles/);
  assert.match(html, /Les réservations restent désactivées/);
  assert.doesNotMatch(html, /Prix expliqué avant confirmation/);
});

test("premium experience keeps the existing app actions and adds a self-contained interactive route globe", () => {
  assert.match(html, /id="search-form"/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="trip-form"/);
  assert.match(html, /id="world-canvas"/);
  assert.match(html, /id="globe-reset"/);
  assert.match(html, /id="globe-turn-left"/);
  assert.match(html, /id="globe-turn-right"/);
  assert.match(html, /Animation illustrative · aucun suivi GPS/);
  assert.match(html, /jc-icon-box/);
  assert.match(html, /jc-icon-shield/);
  assert.match(experienceCss, /prefers-reduced-motion: reduce/);
  assert.match(experienceCss, /@media \(max-width: 760px\)/);
  assert.match(globeJs, /greatCirclePoint/);
  assert.match(globeJs, /pointerdown/);
  assert.match(globeJs, /pointermove/);
  assert.match(globeJs, /prefers-reduced-motion/);
  assert.match(globeJs, /Paris → Dakar/);
  assert.match(globeJs, /Dakar → Paris/);
  assert.match(buildScript, /experience\.css/);
  assert.match(buildScript, /journey-globe\.js/);
});
