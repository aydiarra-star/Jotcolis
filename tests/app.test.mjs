import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const premiumCss = await readFile(new URL("../premium.css", import.meta.url), "utf8");
const experienceCss = await readFile(new URL("../experience.css", import.meta.url), "utf8");
const globeJs = await readFile(new URL("../journey-globe.js", import.meta.url), "utf8");
const buildScript = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");

test("landing page declares French and mobile viewport", () => {
  assert.match(html, /<html lang="fr">/);
  assert.match(html, /name="viewport"/);
});

test("demo displays discreet demo banner and discloses local-only storage", () => {
  assert.match(html, /id="demo-banner"/);
  assert.match(html, /Données de démonstration/);
  assert.match(js, /jotcolis-demo-trips-v1/);
  assert.match(js, /Aucun trajet réel consulté/);
  assert.match(js, /Aucun autre utilisateur ne le voit/);
  assert.match(js, /setDemoBannerVisible\(false\)/);
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

test("Supabase account flows live in the Profil tab, use only a publishable key, and show a small login button on home", () => {
  assert.match(html, /id="home-login-button"[^>]*>Se connecter</);
  assert.match(html, /<section[^>]*id="compte"[^>]*hidden>/);
  assert.match(html, /id="signup-form"/);
  assert.match(html, /id="signin-form"/);
  assert.match(html, /id="signout-button"/);
  assert.match(html, /supabase-config\.js/);
  assert.match(js, /signUp\(/);
  assert.match(js, /signInWithPassword\(/);
  assert.match(js, /auth\.signOut\(/);
  assert.match(js, /publishableKey/);
  assert.doesNotMatch(html, /service d[’']authentification/i);
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
  assert.match(js, /Aucun exemple fictif n’est présenté comme une offre réelle/);
  assert.match(js, /renderEmptyState/);
});

test("identité orange restaurée : jetons de couleur relevés sur la référence visuelle", () => {
  assert.match(css, /--teal:#f47721/);
  assert.match(premiumCss, /--jc-orange:#f47721/);
  assert.match(experienceCss, /--jc-ink: #242326/);
  assert.match(experienceCss, /--jc-ink-soft: #555555/);
  assert.match(experienceCss, /--jc-orange: #f47721/);
  assert.match(experienceCss, /--jc-orange-accent: #df5d0b/);
  assert.match(experienceCss, /--jc-orange-deep: #c65308/);
  assert.match(experienceCss, /--jc-orange-active: #b94c08/);
  assert.match(experienceCss, /--jc-cream: #fff0e3/);
  assert.match(experienceCss, /--jc-paper: #fffaf6/);
  assert.match(experienceCss, /--jc-line-soft: #eee7e1/);
  assert.match(experienceCss, /--jc-black: #232225/);
  assert.match(experienceCss, /--jc-logo-top: #fd9448/);
  assert.match(experienceCss, /--jc-logo-bottom: #f67f2d/);
  assert.match(experienceCss, /--jc-nav-from: #cc5a10/);
  assert.match(experienceCss, /--jc-nav-to: #ec711d/);
  assert.match(experienceCss, /\.mobile-bottom-nav a \{[^}]*min-height: 48px/s);
  assert.match(experienceCss, /prefers-reduced-motion: reduce/);
  assert.match(experienceCss, /button:focus-visible/);
});

test("aucune couleur hors palette ne subsiste dans les feuilles de style", () => {
  // Palette de la référence visuelle + seul jeton sémantique hors palette (erreurs), non affiché.
  const autorisees = new Set([
    "#232225", "#242326", "#555555", "#555",
    "#f47721", "#df5d0b", "#c65308", "#b94c08", "#9a430d",
    "#fff0e3", "#fff5ed", "#fffaf6", "#ffffff", "#fff",
    "#eee7e1", "#fd9448", "#f67f2d", "#cc5a10", "#ec711d", "#f7e4d8",
    "#a43e3e",
  ]);
  for (const [nom, source] of [
    ["styles.css", css],
    ["premium.css", premiumCss],
    ["experience.css", experienceCss],
  ]) {
    const trouvees = source.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    const horsPalette = [...new Set(trouvees.filter((c) => !autorisees.has(c.toLowerCase())))];
    assert.deepEqual(horsPalette, [], `${nom} contient des couleurs hors palette : ${horsPalette.join(", ")}`);
  }
});

test("le bandeau de démonstration est discret et la barre de navigation conserve l’identité", () => {
  assert.match(experienceCss, /\.demo-banner \{[^}]*background: var\(--jc-cream-soft\)[^}]*color: var\(--jc-ink-soft\)/s);
  assert.match(experienceCss, /\.mobile-bottom-nav \{[^}]*linear-gradient\(100deg, var\(--jc-nav-from\) 0%, var\(--jc-nav-to\) 100%\)/s);
  assert.match(experienceCss, /\.mobile-bottom-nav a \{[^}]*color: var\(--jc-nav-ink\)/s);
  assert.match(experienceCss, /aria-current="page"\] \{ background: linear-gradient\(145deg, #ffffff, #ffffff\); color: var\(--jc-orange-active\)/);
  assert.match(experienceCss, /--jc-nav-ink: #f7e4d8/);
  assert.match(html, />Accueil</);
  assert.match(html, />Trajets</);
  assert.match(html, />Envoyer</);
  assert.match(html, />Suivi</);
  assert.match(html, />Profil</);
});

test("accueil orienté usage : titre concret, recherche avant le globe et CTA GP secondaire", () => {
  assert.match(html, /Envoyez vos colis <span>Paris → Dakar<\/span> avec un voyageur vérifié/);
  assert.match(html, /Trouvez un GP qui part déjà, contactez-le et suivez la remise de votre colis\./);
  assert.match(html, /Rechercher un trajet/);
  assert.match(html, /Je voyage, je publie mon trajet/);
  assert.ok(html.indexOf('id="search-form"') < html.indexOf('id="world-canvas"'), "Le formulaire de recherche doit apparaître avant le globe");
  assert.doesNotMatch(html, /Dakar.*Paris\..*Le voyage en confiance/s);
  assert.match(experienceCss, /\.globe-shell \{[^}]*max-width: 245px/s);
});

test("trois bénéfices concrets avec icônes remplacent les textes abstraits", () => {
  assert.doesNotMatch(html, /Une route, deux villes/);
  assert.doesNotMatch(html, /Des règles visibles/);
  assert.match(html, /GP vérifiés/);
  assert.match(html, /Pièce d’identité et téléphone contrôlés/);
  assert.match(html, /Prix au kilo affiché/);
  assert.match(html, /Vous voyez le tarif avant de contacter le GP/);
  assert.match(html, /Code de remise/);
  assert.match(html, /Le destinataire reçoit un code à présenter à la livraison/);
  assert.match(html, /jc-icon-shield/);
  assert.match(html, /jc-icon-tag/);
  assert.match(html, /jc-icon-code/);
});

test("champ Date souhaitée avec placeholder jj/mm/aaaa, icône calendrier et largeur 100 % sans débordement", () => {
  assert.match(html, /id="travel-date"[^>]*placeholder="jj\/mm\/aaaa"/);
  assert.match(html, /<span class="date-placeholder" aria-hidden="true">jj\/mm\/aaaa<\/span>/);
  assert.match(html, /jc-icon-calendar/);
  assert.match(experienceCss, /\.date-input-wrap input\[type="date"\] \{[^}]*width: 100%[^}]*box-sizing: border-box/s);
  assert.match(experienceCss, /\.date-input-wrap \{[^}]*width: 100%[^}]*box-sizing: border-box/s);
});

test("vocabulaire de mise en relation, mention de responsabilité et case objets interdits obligatoire", () => {
  const disclaimer = "JotColis met en relation clients et GP. Le GP vérifie le contenu du colis et en est responsable pendant le transport.";
  assert.doesNotMatch(html, /r[eé]serv(?:er|ation)/i);
  assert.doesNotMatch(js, /r[eé]serv(?:er|ation)/i);
  assert.doesNotMatch(html, /paiements?/i);
  assert.doesNotMatch(js, /paiements?/i);
  assert.doesNotMatch(html, /publication.*validation|validation.*publication/i);
  assert.ok(html.includes(disclaimer), "La fiche colis et la modale doivent afficher la mention de responsabilité");
  assert.ok(js.includes(disclaimer), "Chaque fiche trajet doit afficher la mention de responsabilité");
  assert.match(html, /id="prohibited-items-confirm"[^>]*type="checkbox"[^>]*required/);
  assert.match(html, /Je confirme que mon colis ne contient aucun objet interdit ou illégal\./);
  assert.match(html, /Voir la liste des objets interdits/);
  assert.match(html, /id="prohibited-items-modal"/);
  assert.match(js, /Contacter le GP/);
});

test("état vide utile avec alerte GP (e-mail ou WhatsApp) et bouton Me prévenir", () => {
  assert.match(js, /Aucun GP pour cette date\. Soyez alerté dès qu’un GP publie un trajet /);
  assert.match(js, /id="gp-alert-contact"/);
  assert.match(js, />Me prévenir</);
  assert.match(js, /jotcolis-gp-alerts-v1/);
});

test("boutons interactifs d’au moins 44 px de hauteur", () => {
  assert.match(experienceCss, /\.button \{[^}]*min-height: 46px/s);
  assert.match(experienceCss, /\.header-login-btn,\s*\.header-profile-btn \{[^}]*min-height: 44px/s);
  assert.match(experienceCss, /\.direction-switch \{[^}]*min-height: 44px/s);
  assert.match(experienceCss, /\.globe-control \{[^}]*min-height: 44px/s);
  assert.match(experienceCss, /\.modal-close-btn \{[^}]*min-height: 44px/s);
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

test("globe canvas stays strictly black and white and keeps a highly visible flight marker", () => {
  // Aucune teinte chaude ne doit subsister dans le rendu Canvas du globe.
  for (const warmTone of ["#f47721", "#df5d0b", "#c65308", "#fd9448", "#fff0e3", "#fffaf6", "#fff5ed"]) {
    assert.ok(!globeJs.toLowerCase().includes(warmTone), `${warmTone} ne doit plus colorer le globe`);
  }
  assert.match(globeJs, /const INK = "#0b0b0b"/);
  assert.match(globeJs, /const PAPER = "#ffffff"/);
  assert.match(globeJs, /function drawFlightBadge/);
  assert.match(globeJs, /function tracePlane/);
  // L’insigne de vol est dessiné en dernier pour rester au premier plan.
  assert.ok(globeJs.lastIndexOf("drawFlightBadge(flight, now);") > globeJs.lastIndexOf("drawCity(DAKAR"));
});
