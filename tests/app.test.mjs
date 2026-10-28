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

test("demo makes no false claim of real booking or tracking", () => {
  assert.match(html, /Aucune réservation réelle/);
  assert.match(html, /Tous les événements ci-dessus sont fictifs/);
  assert.match(js, /Aucun trajet réel n’a été consulté/);
  assert.match(js, /Aucune publication de trajet n’est actuellement enregistrée/);
});

test("search form has origin, destination and accessible feedback", () => {
  assert.match(html, /id="origin"/);
  assert.match(html, /id="destination"/);
  assert.match(html, /aria-live="polite"/);
  assert.ok(js.includes('addEventListener("submit"'));
});

test("stylesheet includes keyboard focus and responsive layout", () => {
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media/);
});
