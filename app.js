// JotColis — couche d'interface publique : navigation, mise en page, modales,
// rendu des résultats RÉELS. Aucune donnée de démonstration n'est produite ici.
// La logique métier et Supabase sont dans platform.js.

const CARD_DISCLAIMER = "JotColis met en relation expéditeurs et voyageurs. Le voyageur contrôle lui-même le contenu du colis et peut refuser tout colis douteux. Une déclaration de l’expéditeur ne garantit pas la conformité légale du transport.";

const feedback = document.querySelector("#search-feedback");
const tripResults = document.querySelector("#trip-results");
const homeViews = document.querySelector("#home-views");
const profileView = document.querySelector("#compte");
const homeLoginButton = document.querySelector("#home-login-button");
const homeProfileButton = document.querySelector("#home-profile-button");
const profileBackButton = document.querySelector("#profile-back-button");

const renderedTripsById = new Map();

function norm(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

function isValidContact(value) {
  const cleaned = String(value || "").trim();
  const emailLike = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleaned);
  const digits = cleaned.replace(/\D/g, "");
  const phoneLike = digits.length >= 8 && digits.length <= 15 && /^[+\d\s().-]+$/.test(cleaned);
  return emailLike || phoneLike;
}

function formatRouteLabel(searchContext) {
  const origin = searchContext && searchContext.origin ? String(searchContext.origin).trim() : "";
  const destination = searchContext && searchContext.destination ? String(searchContext.destination).trim() : "";
  if (origin && destination) return origin + " → " + destination;
  return "cet itinéraire";
}

function formatPricePerKg(pricePerKg, currency) {
  if (pricePerKg == null || pricePerKg === "" || !Number.isFinite(Number(pricePerKg))) {
    return "Tarif au kilo non renseigné";
  }
  const amount = Number(pricePerKg).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const unit = currency === "EUR" || !currency ? "€" : String(currency);
  return amount + " " + unit + " / kg";
}

function formatDate(value) {
  if (!value) return "Date à confirmer";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date à confirmer";
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) +
    " · " + date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function formatWeight(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " kg" : "—";
}

function setActiveBottomTab(href) {
  document.querySelectorAll(".mobile-bottom-nav a").forEach(function (item) {
    if (item.getAttribute("href") === href) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
}

function openProfileView() {
  if (homeViews) homeViews.hidden = true;
  if (profileView) profileView.hidden = false;
  setActiveBottomTab("#compte");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function closeProfileView(targetSelector) {
  const wasOpen = Boolean(profileView && !profileView.hidden);
  if (profileView) profileView.hidden = true;
  if (homeViews) homeViews.hidden = false;
  if (wasOpen) window.requestAnimationFrame(function () { window.dispatchEvent(new Event("resize")); });
  const selector = targetSelector || "#accueil";
  const tabMap = { "#accueil": "#accueil", "#resultats": "#resultats", "#publier": "#publier", "#suivi-colis": "#suivi-colis" };
  setActiveBottomTab(tabMap[selector] || "#accueil");
  if (selector === "#accueil") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const target = document.querySelector(selector);
  if (target) window.requestAnimationFrame(function () { target.scrollIntoView({ behavior: "smooth", block: "start" }); });
}

if (homeLoginButton) homeLoginButton.addEventListener("click", openProfileView);
if (homeProfileButton) homeProfileButton.addEventListener("click", openProfileView);
if (profileBackButton) profileBackButton.addEventListener("click", function () { closeProfileView("#accueil"); });

document.querySelectorAll(".mobile-bottom-nav a").forEach(function (link) {
  link.addEventListener("click", function (event) {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    event.preventDefault();
    if (href === "#compte") { openProfileView(); return; }
    closeProfileView(href);
  });
});

document.addEventListener("click", function (event) {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.closest(".mobile-bottom-nav") || link.hasAttribute("data-open-prohibited")) return;
  const href = link.getAttribute("href");
  if (href === "#compte") { event.preventDefault(); openProfileView(); return; }
  if (href && href.length > 1 && profileView && !profileView.hidden) {
    event.preventDefault();
    closeProfileView(href);
  }
});

if (window.location.hash === "#compte") openProfileView();
window.addEventListener("hashchange", function () {
  if (window.location.hash === "#compte") openProfileView();
  else if (profileView && !profileView.hidden) closeProfileView(window.location.hash || "#accueil");
});

// Placeholder « jj/mm/aaaa » et icône calendrier.
function syncDateWrap(input) {
  const wrap = input && input.closest(".date-input-wrap");
  if (wrap) wrap.classList.toggle("is-empty", !input.value);
}
document.querySelectorAll('.date-input-wrap input[type="date"]').forEach(function (input) {
  syncDateWrap(input);
  input.addEventListener("input", function () { syncDateWrap(input); });
  input.addEventListener("change", function () { syncDateWrap(input); });
});
document.addEventListener("reset", function (event) {
  const targetForm = event.target;
  if (!targetForm || typeof targetForm.querySelectorAll !== "function") return;
  window.setTimeout(function () {
    targetForm.querySelectorAll('.date-input-wrap input[type="date"]').forEach(syncDateWrap);
  }, 0);
});
document.addEventListener("click", function (event) {
  const trigger = event.target.closest(".date-picker-trigger");
  if (!trigger) return;
  const input = document.getElementById(trigger.dataset.dateTarget || "");
  if (!input) return;
  input.focus();
  if (typeof input.showPicker === "function") {
    try { input.showPicker(); } catch { /* Le focus suffit. */ }
  }
});

// Raccourcis de corridors : préremplissage uniquement, aucune disponibilité inventée.
document.addEventListener("click", function (event) {
  const card = event.target.closest(".corridor-card");
  if (!card) return;
  const origin = document.getElementById("origin");
  const destination = document.getElementById("destination");
  if (!origin || !destination || !feedback) return;
  event.preventDefault();
  if (profileView && !profileView.hidden) closeProfileView("#accueil");
  origin.value = card.dataset.origin || "";
  destination.value = card.dataset.destination || "Dakar";
  origin.dispatchEvent(new Event("input", { bubbles: true }));
  origin.dispatchEvent(new Event("change", { bubbles: true }));
  destination.dispatchEvent(new Event("input", { bubbles: true }));
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  feedback.hidden = false;
  feedback.textContent = "Itinéraire prérempli. Lancez la recherche pour consulter les trajets réellement publiés.";
  document.querySelector("#search-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
  origin.focus({ preventScroll: true });
}, true);

// Inversion départ / destination.
document.addEventListener("click", function (event) {
  const button = event.target.closest("#swap-direction");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const origin = document.getElementById("origin");
  const destination = document.getElementById("destination");
  if (!origin || !destination) return;
  const oldOrigin = origin.value;
  const oldDestination = destination.value;
  origin.value = oldDestination;
  destination.value = oldOrigin;
  origin.dispatchEvent(new Event("input", { bubbles: true }));
  origin.dispatchEvent(new Event("change", { bubbles: true }));
  destination.dispatchEvent(new Event("input", { bubbles: true }));
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  button.classList.toggle("is-swapped");
  const swapped = button.classList.contains("is-swapped");
  button.setAttribute("aria-label", swapped ? "Sens inversé. Inverser à nouveau le trajet" : "Inverser le sens du trajet");
  button.title = swapped ? "Sens inversé — appuyez pour revenir au sens précédent" : "Inverser départ et destination";
}, true);

function renderEmptyState(container, searchContext) {
  if (!container) return;
  const routeLabel = formatRouteLabel(searchContext);
  const origin = escapeHtml(String(searchContext?.origin || ""));
  const destination = escapeHtml(String(searchContext?.destination || ""));
  const date = escapeHtml(String(searchContext?.date || ""));
  container.innerHTML =
    '<div class="trip-empty platform-empty">' +
      '<p class="trip-empty-title">Aucun trajet publié pour ' + escapeHtml(routeLabel) + '.</p>' +
      '<p class="platform-muted">Seuls les trajets futurs, publiés sur une liaison active, avec un dossier GP approuvé et de la capacité disponible, sont affichés. Aucun exemple fictif n’est présenté comme une offre.</p>' +
      '<form class="gp-alert-form" id="gp-alert-form" data-form="trip-alert" data-origin="' + origin + '" data-destination="' + destination + '" data-date="' + date + '">' +
        '<div class="gp-alert-field">' +
          '<label for="gp-alert-contact">Adresse e-mail ou numéro de contact</label>' +
          '<input id="gp-alert-contact" name="contact" type="text" placeholder="Ex. nom@email.com ou +33 6 12 34 56 78" autocomplete="email" required>' +
        '</div>' +
        '<label class="platform-check"><input id="gp-alert-consent" name="consent" type="checkbox" required> J’accepte l’enregistrement de cette alerte et la politique de confidentialité.</label>' +
        '<button class="button button-primary gp-alert-submit" type="submit">Enregistrer une alerte</button>' +
      '</form>' +
      '<p class="feedback gp-alert-feedback" id="gp-alert-feedback" role="status" aria-live="polite" hidden></p>' +
      '<p class="platform-muted platform-small">Alerte enregistrée en base. Aucun e-mail ni message WhatsApp n’est envoyé tant qu’un prestataire officiel n’est pas configuré et testé.</p>' +
    '</div>';
}

function buildTripCardHtml(trip) {
  renderedTripsById.set(trip.id, trip);
  const isParisDakar = norm(trip.origin) === "paris" && norm(trip.destination) === "dakar";
  const flight = isParisDakar
    ? '<div class="trip-flight" aria-label="Animation de la liaison Paris–Dakar"><span class="flight-city">Paris</span><span class="flight-track"><svg class="route-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 14.5 21l-3.7-7.8L3 9.5 21 3Z" fill="currentColor"/><path d="m10.8 13.2 4.7-4.7" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg></span><span class="flight-city">Dakar</span></div>'
    : "";
  const approved = trip.gp_verification_status === "approved";
  const badges =
    '<div class="trip-badges">' +
      (approved ? '<span class="trip-verified-badge">✓ Dossier GP contrôlé</span>' : "") +
      '<span class="trip-real-tag">Trajet publié</span>' +
    '</div>';
  return (
    '<article class="trip-card' + (isParisDakar ? " trip-card-flight" : "") + '">' +
      badges +
      '<h3>' + escapeHtml(trip.origin) + ' <span aria-hidden="true">→</span> ' + escapeHtml(trip.destination) + '</h3>' +
      flight +
      '<p class="trip-route">' + escapeHtml(trip.dateLabel) + '</p>' +
      '<div class="trip-highlights">' +
        '<span class="trip-price-pill">' + escapeHtml(trip.priceLabel) + '</span>' +
        '<span class="trip-capacity-pill">' + escapeHtml(trip.capacityLabel) + '</span>' +
      '</div>' +
      (trip.conditions ? '<p class="trip-meta">' + escapeHtml(trip.conditions) + '</p>' : "") +
      '<button class="button button-primary button-full trip-contact-trigger" type="button" data-trip-id="' + escapeHtml(trip.id) + '">Déposer une demande</button>' +
      '<p class="card-disclaimer">' + CARD_DISCLAIMER + '</p>' +
    '</article>'
  );
}

function renderTrips(trips, searchContext) {
  if (!tripResults) return;
  renderedTripsById.clear();
  const list = Array.isArray(trips) ? trips : [];
  if (!list.length) { renderEmptyState(tripResults, searchContext); return; }
  tripResults.innerHTML = list.map(function (trip) {
    return buildTripCardHtml({
      id: String(trip.id),
      origin: trip.origin_city,
      destination: trip.destination_city,
      dateLabel: formatDate(trip.departure_at),
      priceLabel: formatPricePerKg(trip.price_per_kg, trip.currency || "EUR"),
      capacityLabel: formatWeight(trip.capacity_remaining_kg) + " disponibles",
      conditions: trip.conditions || "",
      gp_verification_status: trip.gp_verification_status || "",
      published_at: trip.published_at
    });
  }).join("");
}

function renderInitialResults() {
  renderEmptyState(tripResults, { origin: "", destination: "", date: "" });
}

// Modales génériques : fermeture, focus, Escape, clic sur le fond.
(function initModals() {
  const modals = Array.from(document.querySelectorAll(".modal-backdrop"));
  const lastTriggers = new WeakMap();

  function openModal(id, trigger) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (trigger) lastTriggers.set(modal, trigger);
    modal.hidden = false;
    document.body.classList.add("modal-open");
    const focusable = modal.querySelector("input:not([type=hidden]), textarea, select, button, a[href]");
    focusable?.focus();
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    if (modals.every(function (item) { return item.hidden; })) document.body.classList.remove("modal-open");
    const trigger = lastTriggers.get(modal);
    if (trigger && typeof trigger.focus === "function") trigger.focus();
  }

  document.addEventListener("click", function (event) {
    const prohibitedLink = event.target.closest("[data-open-prohibited]");
    if (prohibitedLink) {
      event.preventDefault();
      openModal("prohibited-items-modal", prohibitedLink);
      return;
    }
    const closeButton = event.target.closest("[data-modal-close]");
    if (closeButton) {
      event.preventDefault();
      closeModal(closeButton.closest(".modal-backdrop"));
      return;
    }
    if (event.target.classList && event.target.classList.contains("modal-backdrop")) {
      closeModal(event.target);
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    const open = modals.filter(function (modal) { return !modal.hidden; });
    if (open.length) closeModal(open[open.length - 1]);
  });

  window.JotColisUI = Object.assign(window.JotColisUI || {}, {
    openModal: openModal,
    closeModal: closeModal
  });
})();

renderInitialResults();

window.JotColisUI = Object.assign(window.JotColisUI || {}, {
  escapeHtml: escapeHtml,
  norm: norm,
  isValidContact: isValidContact,
  formatRouteLabel: formatRouteLabel,
  formatPricePerKg: formatPricePerKg,
  formatDate: formatDate,
  formatWeight: formatWeight,
  renderTrips: renderTrips,
  renderEmptyState: renderEmptyState,
  getTrip: function (id) { return renderedTripsById.get(id) || null; },
  openProfileView: openProfileView,
  closeProfileView: closeProfileView,
  CARD_DISCLAIMER: CARD_DISCLAIMER
});
