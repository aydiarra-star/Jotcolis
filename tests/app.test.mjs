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
