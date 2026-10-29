import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");

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


test("brand system stays orange, black and white with accessible mobile motion and focus states", () => {
  assert.match(css, /--teal:#f47721/);
  assert.match(css, /--ink:#171717/);
  assert.match(css, /--white:#ffffff/);
  assert.match(css, /\.mobile-bottom-nav a\{min-height:48px\}/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /button:focus-visible/);
});


test("landing copy avoids promising unavailable booking or fabricated inventory", () => {
  assert.match(html, /Aucune fausse disponibilité/);
  assert.match(html, /Statuts et limites visibles/);
  assert.match(html, /Les réservations restent désactivées/);
  assert.doesNotMatch(html, /Prix expliqué avant confirmation/);
});
