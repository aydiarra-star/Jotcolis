// JotColis — interactions mobile-first de mise en relation clients et GP

const DEMO_STORAGE_KEY = "jotcolis-demo-trips-v1";
const ALERT_STORAGE_KEY = "jotcolis-gp-alerts-v1";
const CARD_DISCLAIMER = "JotColis met en relation clients et GP. Le GP vérifie le contenu du colis et en est responsable pendant le transport.";

const form = document.querySelector("#search-form");
const feedback = document.querySelector("#search-feedback");
const tripForm = document.querySelector("#trip-form");
const tripFeedback = document.querySelector("#trip-feedback");
const tripResults = document.querySelector("#trip-results");
const demoBanner = document.querySelector("#demo-banner");
const resultsDisclaimer = document.querySelector("#results-disclaimer");
const homeViews = document.querySelector("#home-views");
const profileView = document.querySelector("#compte");
const homeLoginButton = document.querySelector("#home-login-button");
const homeProfileButton = document.querySelector("#home-profile-button");
const profileBackButton = document.querySelector("#profile-back-button");

const starterTrips = [
  { id: "demo-1", origin: "Paris", destination: "Dakar", date: "2026-12-12", capacity: 8, pricePerKg: 10, currency: "EUR", gpName: "Moussa D. (exemple)", verified: true, isDemo: true },
  { id: "demo-2", origin: "Dakar", destination: "Paris", date: "2026-12-20", capacity: 5, pricePerKg: 9, currency: "EUR", gpName: "Aminata S. (exemple)", verified: true, isDemo: true },
  { id: "demo-3", origin: "Lyon", destination: "Dakar", date: "2027-01-08", capacity: 4, pricePerKg: 11, currency: "EUR", gpName: "Ibrahima N. (exemple)", verified: true, isDemo: true }
];

const renderedTripsById = new Map();

function norm(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
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

function setDemoBannerVisible(visible) {
  if (demoBanner) demoBanner.hidden = !visible;
  if (resultsDisclaimer) resultsDisclaimer.hidden = !visible;
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
  if (wasOpen) {
    window.requestAnimationFrame(function () {
      window.dispatchEvent(new Event("resize"));
    });
  }
  const selector = targetSelector || "#accueil";
  const tabMap = { "#accueil": "#accueil", "#resultats": "#resultats", "#publier": "#publier", "#suivi-colis": "#suivi-colis" };
  setActiveBottomTab(tabMap[selector] || "#accueil");
  if (selector === "#accueil") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const target = document.querySelector(selector);
  if (target) {
    window.requestAnimationFrame(function () {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }
}

if (homeLoginButton) {
  homeLoginButton.addEventListener("click", function () {
    openProfileView();
  });
}
if (homeProfileButton) {
  homeProfileButton.addEventListener("click", function () {
    openProfileView();
  });
}
if (profileBackButton) {
  profileBackButton.addEventListener("click", function () {
    closeProfileView("#accueil");
  });
}

// Navigation mobile et liens internes (y compris vers l'onglet Profil).
document.querySelectorAll(".mobile-bottom-nav a").forEach(function (link) {
  link.addEventListener("click", function (event) {
    const href = link.getAttribute("href");
    if (!href || !href.startsWith("#")) return;
    event.preventDefault();
    if (href === "#compte") {
      openProfileView();
      return;
    }
    closeProfileView(href);
  });
});

document.addEventListener("click", function (event) {
  const link = event.target.closest('a[href^="#"]');
  if (!link || link.closest(".mobile-bottom-nav") || link.hasAttribute("data-open-prohibited")) return;
  const href = link.getAttribute("href");
  if (href === "#compte") {
    event.preventDefault();
    openProfileView();
    return;
  }
  if (href && href.length > 1 && profileView && !profileView.hidden) {
    event.preventDefault();
    closeProfileView(href);
  }
});

if (window.location.hash === "#compte") {
  openProfileView();
}
window.addEventListener("hashchange", function () {
  if (window.location.hash === "#compte") openProfileView();
  else if (profileView && !profileView.hidden) closeProfileView(window.location.hash || "#accueil");
});

// Synchronisation visuelle du placeholder « jj/mm/aaaa » et de l’icône calendrier.
function syncDateWrap(input) {
  const wrap = input && input.closest(".date-input-wrap");
  if (!wrap) return;
  wrap.classList.toggle("is-empty", !input.value);
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
    try { input.showPicker(); } catch { /* Le focus suffit sur les navigateurs sans showPicker. */ }
  }
});

// Raccourcis des corridors internationaux : préremplit le formulaire sans inventer de disponibilité.
document.addEventListener("click", function (event) {
  const card = event.target.closest(".corridor-card");
  if (!card) return;
  const origin = document.getElementById("origin");
  const destination = document.getElementById("destination");
  if (!origin || !destination || !form) return;
  event.preventDefault();
  if (profileView && !profileView.hidden) closeProfileView("#accueil");
  origin.value = card.dataset.origin || "";
  destination.value = card.dataset.destination || "Dakar";
  origin.dispatchEvent(new Event("input", { bubbles: true }));
  origin.dispatchEvent(new Event("change", { bubbles: true }));
  destination.dispatchEvent(new Event("input", { bubbles: true }));
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  if (feedback) {
    feedback.hidden = false;
    feedback.textContent = "Itinéraire prérempli. Appuyez sur « Rechercher un trajet » pour continuer ; aucune disponibilité réelle n’est consultée avant votre recherche.";
  }
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  origin.focus({ preventScroll: true });
}, true);

// Permutation robuste du sens de recherche, déléguée au document pour résister aux réinitialisations du formulaire.
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
  const originLabel = document.querySelector('label[for="origin"]');
  const destinationLabel = document.querySelector('label[for="destination"]');
  if (originLabel) originLabel.textContent = "Départ";
  if (destinationLabel) destinationLabel.textContent = "Arrivée";
  origin.setAttribute("aria-label", "Ville de départ");
  destination.setAttribute("aria-label", "Ville d’arrivée");
  origin.dispatchEvent(new Event("input", { bubbles: true }));
  origin.dispatchEvent(new Event("change", { bubbles: true }));
  destination.dispatchEvent(new Event("input", { bubbles: true }));
  destination.dispatchEvent(new Event("change", { bubbles: true }));
  button.classList.toggle("is-swapped");
  const swapped = button.classList.contains("is-swapped");
  button.setAttribute("aria-label", swapped ? "Sens inversé. Inverser à nouveau le trajet" : "Inverser le sens du trajet");
  button.title = swapped ? "Sens inversé — appuyez pour revenir au sens précédent" : "Inverser départ et destination";
}, true);

function readTrips() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]");
    const extras = Array.isArray(saved) ? saved.map(function (item) {
      return Object.assign({ isDemo: true, verified: true, gpName: "Voyageur (exemple)" }, item);
    }) : [];
    return starterTrips.concat(extras);
  } catch {
    return starterTrips;
  }
}

function formatRouteLabel(searchContext) {
  const origin = searchContext && searchContext.origin ? String(searchContext.origin).trim() : "";
  const destination = searchContext && searchContext.destination ? String(searchContext.destination).trim() : "";
  if (origin && destination) return origin + " → " + destination;
  return "Paris → Dakar";
}

function formatPricePerKg(pricePerKg, currency) {
  if (pricePerKg == null || pricePerKg === "" || !Number.isFinite(Number(pricePerKg))) {
    return "Tarif au kilo à convenir avec le GP";
  }
  const amount = Number(pricePerKg).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const unit = currency === "EUR" || !currency ? "€" : String(currency);
  return amount + " " + unit + " / kg";
}

function renderEmptyState(container, searchContext, options) {
  if (!container) return;
  const routeLabel = formatRouteLabel(searchContext);
  const safeRoute = escapeHtml(routeLabel);
  const showDemoReset = Boolean(options && options.isDemo);
  container.innerHTML =
    '<div class="trip-empty">' +
      '<p class="trip-empty-title">Aucun GP pour cette date. Soyez alerté dès qu’un GP publie un trajet ' + safeRoute + '.</p>' +
      '<form class="gp-alert-form" id="gp-alert-form" data-route="' + safeRoute + '">' +
        '<div class="gp-alert-field">' +
          '<label for="gp-alert-contact">Votre e-mail ou numéro WhatsApp</label>' +
          '<input id="gp-alert-contact" name="contact" type="text" placeholder="Ex. nom@email.com ou +33 6 12 34 56 78" autocomplete="email" required>' +
        '</div>' +
        '<button class="button button-primary gp-alert-submit" type="submit">Me prévenir</button>' +
      '</form>' +
      '<p class="feedback gp-alert-feedback" id="gp-alert-feedback" role="status" aria-live="polite" hidden></p>' +
      (showDemoReset ? '<button class="button button-secondary trip-empty-reset" id="reset-demo-trips" type="button">Afficher tous les trajets de démonstration</button>' : '') +
    '</div>';
}

document.addEventListener("submit", function (event) {
  const alertForm = event.target.closest("#gp-alert-form");
  if (!alertForm) return;
  event.preventDefault();
  const input = alertForm.querySelector("#gp-alert-contact");
  const alertFeedback = alertForm.parentElement && alertForm.parentElement.querySelector("#gp-alert-feedback");
  if (!input || !alertFeedback) return;
  const contact = input.value.trim();
  const route = alertForm.dataset.route || "Paris → Dakar";
  alertFeedback.hidden = false;
  if (!isValidContact(contact)) {
    alertFeedback.textContent = "Indiquez une adresse e-mail ou un numéro WhatsApp valide.";
    input.focus();
    return;
  }
  try {
    const existing = JSON.parse(localStorage.getItem(ALERT_STORAGE_KEY) || "[]");
    const list = Array.isArray(existing) ? existing : [];
    list.push({ route: route, contact: contact, createdAt: new Date().toISOString() });
    localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Stockage local non bloquant si le navigateur restreint localStorage.
  }
  alertFeedback.textContent = "Alerte enregistrée sur cet appareil pour " + route + ". Vous serez prévenu dès l’ouverture des alertes GP.";
  alertForm.reset();
});

document.addEventListener("click", function (event) {
  const resetBtn = event.target.closest("#reset-demo-trips");
  if (!resetBtn) return;
  renderTrips();
  if (feedback) {
    feedback.hidden = false;
    feedback.textContent = "Affichage des trajets de démonstration locaux.";
  }
});

function buildTripCardHtml(trip) {
  renderedTripsById.set(trip.id, trip);
  const isParisDakar = norm(trip.origin) === "paris" && norm(trip.destination) === "dakar";
  const flight = isParisDakar
    ? '<div class="trip-flight" aria-label="Animation de la liaison Paris–Dakar"><span class="flight-city">Paris</span><span class="flight-track"><svg class="route-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 14.5 21l-3.7-7.8L3 9.5 21 3Z" fill="currentColor"/><path d="m10.8 13.2 4.7-4.7" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg></span><span class="flight-city">Dakar</span></div>'
    : "";
  const badges =
    '<div class="trip-badges">' +
      (trip.verified ? '<span class="trip-verified-badge">✓ GP vérifié</span>' : '') +
      '<span class="trip-demo-tag">' + (trip.isDemo ? 'Exemple' : 'Trajet disponible') + '</span>' +
    '</div>';
  return (
    '<article class="trip-card' + (isParisDakar ? ' trip-card-flight' : '') + '">' +
      badges +
      '<h3>' + escapeHtml(trip.origin) + ' <span aria-hidden="true">→</span> ' + escapeHtml(trip.destination) + '</h3>' +
      flight +
      '<p class="trip-route">' + escapeHtml(trip.dateLabel) + '</p>' +
      '<div class="trip-highlights">' +
        '<span class="trip-price-pill">' + escapeHtml(trip.priceLabel) + '</span>' +
        '<span class="trip-capacity-pill">' + escapeHtml(trip.capacityLabel) + '</span>' +
      '</div>' +
      (trip.gpName ? '<p class="trip-meta">Voyageur : ' + escapeHtml(trip.gpName) + '</p>' : '') +
      (trip.conditions ? '<p class="trip-meta">' + escapeHtml(trip.conditions) + '</p>' : '') +
      '<button class="button button-primary button-full trip-contact-trigger" type="button" data-trip-id="' + escapeHtml(trip.id) + '">Contacter le GP</button>' +
      '<p class="card-disclaimer">' + CARD_DISCLAIMER + '</p>' +
    '</article>'
  );
}

function renderTrips(trips, searchContext) {
  if (!tripResults) return;
  const list = trips || readTrips();
  setDemoBannerVisible(true);
  if (!list.length) {
    renderEmptyState(tripResults, searchContext, { isDemo: true });
    return;
  }
  tripResults.innerHTML = list.map(function (trip) {
    const dateLabel = trip.date
      ? new Date(trip.date + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      : "Date non précisée";
    return buildTripCardHtml({
      id: String(trip.id),
      origin: trip.origin,
      destination: trip.destination,
      dateLabel: dateLabel,
      priceLabel: formatPricePerKg(trip.pricePerKg, trip.currency || "EUR"),
      capacityLabel: Number(trip.capacity).toLocaleString("fr-FR") + " kg disponibles",
      gpName: trip.gpName || "Voyageur (exemple)",
      conditions: trip.conditions || "",
      verified: Boolean(trip.verified),
      isDemo: true
    });
  }).join("");
}

// Affiche les exemples locaux au chargement tant qu’aucune recherche réelle n’est lancée.
renderTrips();

if (form && feedback) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const origin = document.querySelector("#origin").value.trim();
    const destination = document.querySelector("#destination").value.trim();
    const date = document.querySelector("#travel-date").value;
    const weight = document.querySelector("#weight").value;
    const matches = readTrips().filter(function (trip) {
      return norm(trip.origin) === norm(origin)
        && norm(trip.destination) === norm(destination)
        && (!date || !trip.date || trip.date >= date)
        && (weight === "any" || Number(trip.capacity) >= Number(weight));
    });
    feedback.hidden = false;
    feedback.textContent = "Démo locale : " + matches.length + " trajet(s) d’exemple trouvé(s). Aucun trajet réel consulté.";
    renderTrips(matches, { origin: origin, destination: destination, date: date });
    document.querySelector("#resultats")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// Modales : contacter le GP (avec case obligatoire objets interdits) et liste des objets interdits.
(function initContactAndProhibitedModals() {
  const contactModal = document.querySelector("#contact-gp-modal");
  const contactClose = document.querySelector("#contact-gp-close");
  const contactSummary = document.querySelector("#contact-trip-summary");
  const contactForm = document.querySelector("#contact-gp-form");
  const contactFeedback = document.querySelector("#contact-gp-feedback");
  const contactSubmit = document.querySelector("#contact-gp-submit");
  const prohibitedCheckbox = document.querySelector("#prohibited-items-confirm");
  const prohibitedHint = document.querySelector("#prohibited-hint");
  const prohibitedModal = document.querySelector("#prohibited-items-modal");
  const prohibitedClose = document.querySelector("#prohibited-items-close");
  const prohibitedOk = document.querySelector("#prohibited-items-ok");

  let selectedTrip = null;
  let lastTrigger = null;
  let lastProhibitedTrigger = null;

  function syncSubmitButton() {
    if (!contactSubmit || !prohibitedCheckbox) return;
    const checked = Boolean(prohibitedCheckbox.checked);
    contactSubmit.disabled = !checked;
    if (prohibitedHint) prohibitedHint.hidden = checked;
  }

  function openContactModal(trip, trigger) {
    if (!contactModal || !contactSummary || !contactForm) return;
    selectedTrip = trip;
    lastTrigger = trigger || null;
    contactForm.reset();
    if (contactFeedback) {
      contactFeedback.hidden = true;
      contactFeedback.textContent = "";
    }
    syncSubmitButton();
    contactSummary.innerHTML =
      '<strong>' + escapeHtml(trip.origin) + ' → ' + escapeHtml(trip.destination) + '</strong>' +
      '<span>' + escapeHtml(trip.dateLabel) + ' · ' + escapeHtml(trip.priceLabel) + ' · ' + escapeHtml(trip.capacityLabel) + '</span>';
    contactModal.hidden = false;
    document.body.classList.add("modal-open");
    document.querySelector("#contact-sender")?.focus();
  }

  function closeContactModal() {
    if (!contactModal) return;
    contactModal.hidden = true;
    if (!prohibitedModal || prohibitedModal.hidden) {
      document.body.classList.remove("modal-open");
    }
    if (lastTrigger && typeof lastTrigger.focus === "function") lastTrigger.focus();
  }

  function openProhibitedModal(trigger) {
    if (!prohibitedModal) return;
    lastProhibitedTrigger = trigger || null;
    prohibitedModal.hidden = false;
    document.body.classList.add("modal-open");
    prohibitedClose?.focus();
  }

  function closeProhibitedModal() {
    if (!prohibitedModal) return;
    prohibitedModal.hidden = true;
    if (!contactModal || contactModal.hidden) {
      document.body.classList.remove("modal-open");
    }
    if (lastProhibitedTrigger && typeof lastProhibitedTrigger.focus === "function") {
      lastProhibitedTrigger.focus();
    }
  }

  document.addEventListener("click", function (event) {
    const contactBtn = event.target.closest(".trip-contact-trigger");
    if (contactBtn) {
      const trip = renderedTripsById.get(contactBtn.dataset.tripId || "");
      if (trip) openContactModal(trip, contactBtn);
      return;
    }
    const prohibitedLink = event.target.closest("[data-open-prohibited]");
    if (prohibitedLink) {
      event.preventDefault();
      openProhibitedModal(prohibitedLink);
    }
  });

  if (prohibitedCheckbox) {
    prohibitedCheckbox.addEventListener("change", syncSubmitButton);
  }

  if (contactForm && contactFeedback) {
    contactForm.addEventListener("submit", function (event) {
      event.preventDefault();
      contactFeedback.hidden = false;
      if (!prohibitedCheckbox || !prohibitedCheckbox.checked) {
        contactFeedback.textContent = "Cochez la confirmation sur les objets interdits avant de contacter le GP.";
        prohibitedCheckbox?.focus();
        return;
      }
      const senderInput = document.querySelector("#contact-sender");
      const senderValue = senderInput ? senderInput.value.trim() : "";
      if (!isValidContact(senderValue)) {
        contactFeedback.textContent = "Indiquez un numéro WhatsApp ou une adresse e-mail valide.";
        senderInput?.focus();
        return;
      }
      const route = selectedTrip ? selectedTrip.origin + " → " + selectedTrip.destination : "ce trajet";
      if (selectedTrip && selectedTrip.isDemo) {
        contactFeedback.textContent = "Mode démonstration : votre demande de place pour " + route + " n’a pas été envoyée à un vrai voyageur. Dès qu’un GP réel est disponible, votre demande lui sera transmise directement.";
      } else {
        contactFeedback.textContent = "Demande de place prête pour " + route + ". La mise en relation directe avec le GP s’ouvrira dès l’activation de la messagerie GP.";
      }
    });
  }

  if (contactClose) contactClose.addEventListener("click", closeContactModal);
  if (prohibitedClose) prohibitedClose.addEventListener("click", closeProhibitedModal);
  if (prohibitedOk) prohibitedOk.addEventListener("click", closeProhibitedModal);

  if (contactModal) {
    contactModal.addEventListener("click", function (event) {
      if (event.target === contactModal) closeContactModal();
    });
  }
  if (prohibitedModal) {
    prohibitedModal.addEventListener("click", function (event) {
      if (event.target === prohibitedModal) closeProhibitedModal();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (prohibitedModal && !prohibitedModal.hidden) {
      closeProhibitedModal();
      return;
    }
    if (contactModal && !contactModal.hidden) {
      closeContactModal();
    }
  });
})();

if (tripForm && tripFeedback) {
  tripForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const client = window.JOTCOLIS_SUPABASE;
    const origin = document.querySelector("#trip-origin").value.trim();
    const destination = document.querySelector("#trip-destination").value.trim();
    const date = document.querySelector("#trip-date").value;
    const capacity = Number(document.querySelector("#trip-capacity").value);
    const priceText = document.querySelector("#trip-price").value.trim();
    const price = priceText === "" ? null : Number(priceText);
    const currency = document.querySelector("#trip-currency").value;
    const conditions = document.querySelector("#trip-conditions").value.trim();
    if (client) {
      const button = tripForm.querySelector('button[type="submit"]');
      const corridorId = document.querySelector("#trip-corridor").value;
      if (!origin || !destination || !date || !corridorId || !Number.isFinite(capacity) || capacity <= 0 || capacity > 500 || (price !== null && (!Number.isFinite(price) || price < 0))) {
        tripFeedback.textContent = "Vérifiez la liaison, les villes, la date, la capacité et le prix.";
        return;
      }
      if (new Date(date + "T23:59:59").getTime() <= Date.now()) {
        tripFeedback.textContent = "La date de départ doit être dans le futur.";
        return;
      }
      button.disabled = true;
      tripFeedback.textContent = "Enregistrement du trajet en cours…";
      try {
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        if (!sessionResult.data.session) {
          tripFeedback.textContent = "Connectez-vous dans votre profil pour enregistrer un trajet.";
          return;
        }
        const result = await client.rpc("create_trip_draft", {
          p_corridor_id: corridorId,
          p_origin_city: origin,
          p_destination_city: destination,
          p_departure_at: new Date(date + "T12:00:00").toISOString(),
          p_capacity_kg: capacity,
          p_currency: currency,
          p_price_per_kg: price,
          p_conditions: conditions || null
        });
        if (result.error) throw result.error;
        const publishResult = await client.rpc("publish_my_trip", { p_trip_id: result.data });
        if (!publishResult.error) {
          tripFeedback.textContent = "Trajet enregistré et visible aux expéditeurs. Référence : " + result.data + ".";
        } else {
          tripFeedback.textContent = "Trajet enregistré dans votre espace (réf. " + result.data + "). Il sera visible dès que votre profil GP et cette liaison seront actifs.";
        }
        tripForm.reset();
        document.querySelector("#trip-capacity").value = "5";
        await loadTripCorridors();
      } catch (error) {
        const message = String(error && error.message || "");
        if (message.includes("ACCOUNT_NOT_ACTIVE")) tripFeedback.textContent = "Ce compte n’est pas actif. Contactez l’équipe JotColis.";
        else tripFeedback.textContent = "Enregistrement impossible. Vérifiez votre connexion et les champs, puis réessayez.";
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (!origin || !destination || !date || !Number.isFinite(capacity) || capacity < 1 || capacity > 100) {
      tripFeedback.textContent = "Démo locale : vérifiez les villes, la date et une capacité comprise entre 1 et 100 kg.";
      return;
    }
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]");
      if (!Array.isArray(saved)) saved = [];
    } catch {
      saved = [];
    }
    saved.push({
      id: "local-" + Date.now(),
      origin: origin,
      destination: destination,
      date: date,
      capacity: capacity,
      pricePerKg: price,
      currency: currency,
      conditions: conditions,
      gpName: "Votre trajet (exemple)",
      verified: true,
      isDemo: true
    });
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
      tripFeedback.textContent = "Trajet d’exemple ajouté dans ce navigateur seulement. Aucun autre utilisateur ne le voit.";
      tripForm.reset();
      document.querySelector("#trip-capacity").value = "5";
      renderTrips();
    } catch {
      tripFeedback.textContent = "Impossible d’enregistrer ce trajet dans ce navigateur. Vérifiez les autorisations de stockage puis réessayez.";
    }
  });
}

// Connexion Supabase (clé publique navigateur uniquement).
(function initJotColisAuth() {
  const status = document.querySelector("#auth-status");
  const signupForm = document.querySelector("#signup-form");
  const signinForm = document.querySelector("#signin-form");
  const sessionPanel = document.querySelector("#account-session");
  const emailLabel = document.querySelector("#account-email");
  const signoutButton = document.querySelector("#signout-button");
  if (!status || !signupForm || !signinForm) return;

  const config = window.JOTCOLIS_CONFIG;
  if (!window.supabase || !config || !config.url || !config.publishableKey) {
    status.textContent = "La connexion au compte est momentanément indisponible. Vous pouvez quand même parcourir la démonstration.";
    signupForm.querySelector("button[type=submit]").disabled = true;
    signinForm.querySelector("button[type=submit]").disabled = true;
    return;
  }

  const client = window.supabase.createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  window.JOTCOLIS_SUPABASE = client;

  function setAuthStatus(message) { status.textContent = message; }
  function renderSession(session) {
    const signedIn = Boolean(session && session.user);
    sessionPanel.hidden = !signedIn;
    signupForm.hidden = signedIn;
    signinForm.hidden = signedIn;
    if (homeLoginButton) homeLoginButton.hidden = signedIn;
    if (homeProfileButton) homeProfileButton.hidden = !signedIn;
    if (signedIn && emailLabel) emailLabel.textContent = "Connecté : " + session.user.email;
    if (signedIn) setAuthStatus("Vous êtes connecté à votre espace JotColis.");
  }

  signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = signupForm.querySelector("button[type=submit]");
    const displayName = document.querySelector("#signup-name").value.trim();
    const email = document.querySelector("#signup-email").value.trim();
    const password = document.querySelector("#signup-password").value;
    if (!displayName || password.length < 8) {
      setAuthStatus("Saisissez un nom et un mot de passe d’au moins 8 caractères.");
      return;
    }
    button.disabled = true;
    setAuthStatus("Création de votre compte en cours…");
    try {
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      if (data.session) {
        renderSession(data.session);
      } else {
        setAuthStatus("Inscription enregistrée. Ouvrez votre e-mail pour confirmer votre compte avant de vous connecter.");
      }
    } catch (error) {
      setAuthStatus(error && error.message ? "Inscription impossible : " + error.message : "Inscription impossible. Réessayez plus tard.");
    } finally { button.disabled = false; }
  });

  signinForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const button = signinForm.querySelector("button[type=submit]");
    const email = document.querySelector("#signin-email").value.trim();
    const password = document.querySelector("#signin-password").value;
    button.disabled = true;
    setAuthStatus("Connexion en cours…");
    try {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      renderSession(data.session);
    } catch (error) {
      setAuthStatus(error && error.message ? "Connexion impossible : " + error.message : "Connexion impossible. Vérifiez vos identifiants.");
    } finally { button.disabled = false; }
  });

  if (signoutButton) signoutButton.addEventListener("click", async function () {
    signoutButton.disabled = true;
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      renderSession(null);
      setAuthStatus("Vous êtes déconnecté.");
    } catch (error) {
      setAuthStatus(error && error.message ? "Déconnexion impossible : " + error.message : "Déconnexion impossible. Réessayez.");
    } finally { signoutButton.disabled = false; }
  });

  client.auth.onAuthStateChange(function (_event, session) { renderSession(session); });
  client.auth.getSession().then(function (result) {
    if (result.error) throw result.error;
    renderSession(result.data.session);
    if (!result.data.session) setAuthStatus("Créez votre compte ou connectez-vous pour commencer.");
  }).catch(function () {
    setAuthStatus("Impossible de vérifier votre session. Vérifiez votre connexion puis rechargez la page.");
  });
})();

// Charge les liaisons disponibles sans exposer les notes internes.
async function loadTripCorridors() {
  const select = document.querySelector("#trip-corridor");
  const client = window.JOTCOLIS_SUPABASE;
  if (!select) return;
  select.replaceChildren();
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Connectez-vous pour charger les liaisons";
  select.appendChild(placeholder);
  if (!client) return;
  try {
    const sessionResult = await client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    if (!sessionResult.data.session) return;
    placeholder.textContent = "Chargement des liaisons…";
    const result = await client.rpc("list_trip_corridors");
    if (result.error) throw result.error;
    if (!Array.isArray(result.data) || result.data.length === 0) {
      placeholder.textContent = "Aucune liaison configurée";
      return;
    }
    result.data.forEach(function (corridor) {
      const option = document.createElement("option");
      option.value = corridor.id;
      option.textContent = corridor.origin_label + " → " + corridor.destination_label +
        (corridor.is_active ? " · ouverte" : " · bientôt ouverte");
      select.appendChild(option);
    });
    placeholder.textContent = "Choisissez une liaison";
  } catch {
    placeholder.textContent = "Liaisons indisponibles pour le moment";
  }
}

// Recherche connectée : seules les offres publiées sur un corridor actif sont affichées.
// Si le backend est configuré mais indisponible, ne jamais présenter les exemples fictifs comme réels.
(function initPublishedTripSearch() {
  const searchForm = document.querySelector("#search-form");
  const searchFeedback = document.querySelector("#search-feedback");
  const results = document.querySelector("#trip-results");
  if (!searchForm || !searchFeedback || !results) return;

  function renderPublishedTrips(trips, searchContext) {
    if (!trips.length) {
      setDemoBannerVisible(true);
      renderEmptyState(results, searchContext, { isDemo: false });
      return;
    }
    setDemoBannerVisible(false);
    results.innerHTML = trips.map(function (trip) {
      const dateLabel = trip.departure_at
        ? new Date(trip.departure_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "Date à confirmer";
      const capacity = Number(trip.capacity_remaining_kg);
      const capacityLabel = Number.isFinite(capacity)
        ? capacity.toLocaleString("fr-FR") + " kg disponibles"
        : "Capacité à confirmer";
      return buildTripCardHtml({
        id: "real-" + String(trip.id),
        origin: trip.origin_city,
        destination: trip.destination_city,
        dateLabel: dateLabel,
        priceLabel: formatPricePerKg(trip.price_per_kg, trip.currency || "EUR"),
        capacityLabel: capacityLabel,
        gpName: "",
        conditions: trip.conditions || "",
        verified: true,
        isDemo: false
      });
    }).join("");
  }

  searchForm.addEventListener("submit", async function (event) {
    const client = window.JOTCOLIS_SUPABASE;
    if (!client) return; // Le gestionnaire de démonstration local prend le relais.
    event.preventDefault();
    event.stopImmediatePropagation();
    const origin = document.querySelector("#origin").value.trim();
    const destination = document.querySelector("#destination").value.trim();
    const date = document.querySelector("#travel-date").value;
    const weight = document.querySelector("#weight").value;
    const button = searchForm.querySelector('button[type="submit"]');
    button.disabled = true;
    searchFeedback.hidden = false;
    searchFeedback.textContent = "Recherche des trajets disponibles…";
    try {
      let query = client.from("trips")
        .select("id, origin_city, destination_city, departure_at, capacity_remaining_kg, price_per_kg, currency, conditions, corridors!inner(is_active)")
        .eq("status", "published")
        .eq("corridors.is_active", true)
        .ilike("origin_city", "%" + origin + "%")
        .ilike("destination_city", "%" + destination + "%")
        .gte("departure_at", new Date().toISOString())
        .order("departure_at", { ascending: true })
        .limit(30);
      if (date) query = query.gte("departure_at", new Date(date + "T00:00:00").toISOString());
      if (weight !== "any") query = query.gte("capacity_remaining_kg", Number(weight));
      const { data, error } = await query;
      if (error) throw error;
      const trips = Array.isArray(data) ? data : [];
      searchFeedback.textContent = trips.length
        ? trips.length + " trajet(s) disponible(s). Contactez le GP de votre choix pour demander une place."
        : "Aucun GP disponible pour cette recherche pour le moment.";
      renderPublishedTrips(trips, { origin: origin, destination: destination, date: date });
    } catch {
      setDemoBannerVisible(true);
      searchFeedback.textContent = "Recherche indisponible : impossible de vérifier les trajets réels. Aucun exemple fictif n’est présenté comme une offre réelle.";
      renderEmptyState(results, { origin: origin, destination: destination, date: date }, { isDemo: false });
    } finally {
      button.disabled = false;
    }
    document.querySelector("#resultats")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, true);
})();

if (window.JOTCOLIS_SUPABASE) {
  loadTripCorridors();
  window.JOTCOLIS_SUPABASE.auth.onAuthStateChange(function () { loadTripCorridors(); });
}
