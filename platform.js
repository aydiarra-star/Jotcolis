// JotColis — logique applicative connectée à Supabase.
// Aucune donnée de démonstration, aucune confirmation sans écriture serveur réussie.
(function () {
  "use strict";

  const UI = window.JotColisUI || {};
  const $ = function (selector, root) { return (root || document).querySelector(selector); };
  const $$ = function (selector, root) { return Array.from((root || document).querySelectorAll(selector)); };
  const esc = function (value) { return UI.escapeHtml ? UI.escapeHtml(value) : String(value ?? ""); };

  const STATUS_LABELS = {
    draft: "Brouillon", submitted: "Soumise", awaiting_gp: "En attente du voyageur",
    accepted: "Acceptée", rejected: "Refusée", awaiting_confirmation: "En attente de confirmation",
    confirmed: "Confirmée", in_preparation: "En préparation", in_transit: "En cours de transport",
    arrived: "Arrivée à destination", ready_for_pickup: "Disponible pour remise",
    delivered: "Remise effectuée", cancelled: "Annulée", disputed: "Litige",
    expired: "Expirée", open: "Ouverte", matched: "Correspondance", pending: "En attente",
    published: "Publié", completed: "Terminé", suspended: "Suspendu",
    not_submitted: "Non soumis", in_review: "Vérification en cours", approved: "Approuvé",
    not_checked: "Contrôle non réalisé", failed: "Contrôle échoué", checked: "Contrôlé",
    active: "Actif", closed: "Clôturé", under_review: "En cours d’examen", resolved: "Résolu",
    blocked: "Bloqué (aucun envoi)", claimed: "En cours d’envoi", sent: "Envoyé / disponible",
    dead: "Échec définitif", skipped: "Ignoré"
  };

  const PROVIDER_STATE_LABELS = {
    non_configure: "Non configuré",
    configure: "Configuré (secrets serveur détectés)",
    teste: "Testé (confirmation prestataire)",
    operationnel: "Opérationnel",
    en_erreur: "En erreur"
  };

  const EVENT_LABELS = {
    parcel_received: "Colis pris en charge", inspection_recorded: "Contrôle du contenu déclaré",
    departure_reported: "Départ confirmé", arrival_reported: "Arrivée confirmée",
    ready_for_pickup: "Colis disponible pour remise", handover_reported: "Remise préparée"
  };

  const MIGRATION_MESSAGE = "Les migrations JotColis ne sont pas appliquées ou ne sont pas exposées sur ce projet Supabase. Aucune donnée métier n’est simulée. Appliquez les migrations autorisées, puis rechargez.";
  const MIGRATION_ERROR_PATTERN = /MIGRATIONS_MISSING|PGRST20[1-9]|PGRST116|42P01|42883|42P13|schema cache|Could not find the function|Could not find the table|relation .* does not exist|function .* does not exist|migrations non appliquées/i;

  const ERROR_MESSAGES = [
    [/MIGRATIONS_MISSING/, MIGRATION_MESSAGE],
    [/PGRST20[1-9]|PGRST116|42P01|42883|42P13|schema cache|Could not find the function|Could not find the table|relation .* does not exist|function .* does not exist/i, MIGRATION_MESSAGE],
    [/COMMERCIAL_OPERATIONS_DISABLED/, "Les transports réels sont bloqués : les validations juridiques et l’ouverture commerciale ne sont pas enregistrées."],
    [/LEGAL_VALIDATIONS_INCOMPLETE/, "Validations juridiques France et Sénégal incomplètes."],
    [/LEGAL_VALIDATION_REQUIRED|LEGAL_REFERENCE_REQUIRED/, "Une référence de validation juridique documentée est requise."],
    [/NO_VALIDATED_ACTIVE_CORRIDOR/, "Aucune liaison active avec référence juridique validée."],
    [/NOTIFICATIONS_REQUIRED|NO_NOTIFICATION_PROVIDER_CONFIGURED/, "Un prestataire de notification officiel doit être configuré et testé."],
    [/PRICING_VALIDATION_REQUIRED|PRICING_NOT_VALIDATED|PRICE_NOT_CONFIGURED/, "La grille tarifaire n’est pas validée. Aucun montant ni commission n’est inventé."],
    [/EMAIL_NOT_VERIFIED/, "Confirmez votre adresse e-mail avant cette opération."],
    [/PROFILE_INCOMPLETE/, "Complétez votre profil et acceptez les conditions avant cette opération."],
    [/ACCOUNT_NOT_ACTIVE/, "Ce compte est suspendu ou désactivé."],
    [/GP_APPROVAL_REQUIRED/, "Le dossier du voyageur doit être approuvé par un administrateur."],
    [/SELF_APPROVAL_FORBIDDEN/, "Un administrateur ne peut pas approuver son propre dossier."],
    [/SELF_ROLE_CHANGE_FORBIDDEN|SELF_ACCOUNT_CHANGE_FORBIDDEN/, "Un administrateur ne peut pas modifier ses propres privilèges ou son propre statut."],
    [/ROLE_NOT_SELF_ASSIGNABLE/, "Ce rôle ne peut pas être attribué par l’utilisateur lui-même."],
    [/ADMIN_REQUIRED/, "Cette action est réservée à un administrateur autorisé."],
    [/CAPACITY_EXHAUSTED/, "Capacité insuffisante : la réservation a été refusée sans dépassement."],
    [/TRIP_NOT_AVAILABLE|TRIP_NOT_AVAILABLE/, "Ce trajet n’est plus disponible (capacité, date, publication ou prix)."],
    [/DUPLICATE_REQUEST/, "Une demande identique a déjà été enregistrée récemment."],
    [/DECLARATIONS_REQUIRED|TERMS_REQUIRED|CONSENT_REQUIRED/, "Les déclarations et consentements obligatoires doivent être cochés."],
    [/CONTENT_DECLARATION_REQUIRED/, "La déclaration du contenu du colis est obligatoire."],
    [/SELF_BOOKING_FORBIDDEN/, "Vous ne pouvez pas déposer une demande sur votre propre trajet."],
    [/BOOKING_ALREADY_EXISTS/, "Cette demande a déjà donné lieu à une réservation."],
    [/INVALID_BOOKING_TRANSITION|BOOKING_NOT_/, "Cette étape n’est pas autorisée dans l’état actuel du dossier."],
    [/DELIVERY_CODE_ALREADY_ISSUED/, "Un code a déjà été généré pour ce colis. Il n’est pas réaffichable."],
    [/DELIVERY_CODE_NOT_ACTIVE|DELIVERY_CODE_EXPIRED|DELIVERY_CODE_LOCKED/, "Ce code n’est plus valable ou est verrouillé. Une procédure administrative est nécessaire."],
    [/DELIVERY_CODE_NOT_ISSUED/, "Aucun code de remise n’a encore été généré pour ce colis."],
    [/NOT_BOOKING_GP|NOT_BOOKING_SENDER|NOT_BOOKING_PARTICIPANT|NOT_TRIP_OWNER|OWN_/, "Vous n’êtes pas autorisé sur ce dossier."],
    [/ACTIVE_BOOKINGS_PRESENT|TRIP_LOCKED_BY_BOOKINGS/, "Ce trajet comporte des réservations actives : contactez l’administration."],
    [/PROVIDER_SECRET_FORBIDDEN/, "N’indiquez aucun secret dans un formulaire : les secrets restent exclusivement côté serveur."],
    [/NOTIFICATION_ACTIVATION_SERVER_ONLY/, "L’activation des notifications externes est dérivée d’un test prestataire confirmé côté serveur, jamais d’un bouton administrateur."],
    [/PROVIDER_TEST_REQUIRED|PROVIDER_CONFIRMATION_REQUIRED/, "Une confirmation réelle du prestataire est requise avant toute activation ou marquage envoyé."],
    [/PERMISSION_DENIED|permission denied/i, "Action refusée par les autorisations serveur."],
    [/Failed to fetch|NetworkError|fetch failed/i, "Connexion au service indisponible. Réessayez."]
  ];

  const state = {
    client: null,
    session: null,
    me: null,
    isAdmin: false,
    activeTab: "overview",
    selectedBookingId: null,
    issuedCodes: {},
    corridors: [],
    trips: [],
    requests: [],
    bookings: [],
    passportEvents: [],
    incidents: [],
    notifications: [],
    deliveryCodeStatus: [],
    verificationDocuments: [],
    tripAlerts: [],
    prohibitedCategories: [],
    adminOverview: null,
    backendError: null,
    dashboardFeedback: null,
    selectedTrip: null,
    requestIdempotencyKey: null,
    environment: "Prévisualisation (détection en cours)",
    environmentMode: "preview"
  };

  function statusLabel(value) { return STATUS_LABELS[value] || String(value ?? "—"); }
  function providerStateLabel(value) { return PROVIDER_STATE_LABELS[value] || String(value ?? "Non configuré"); }
  function eventLabel(value) { return EVENT_LABELS[value] || statusLabel(value); }
  function boolLabel(value) { return value ? "Oui" : "Non"; }
  function formatMoney(value, currency) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return amount.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " " + (currency || "EUR");
  }
  function formatDate(value) { return UI.formatDate ? UI.formatDate(value) : String(value ?? "—"); }
  function value(data, key) { const v = data.get(key); return typeof v === "string" ? v.trim() : ""; }
  function checked(data, key) { return data.get(key) === "on" || data.get(key) === "true"; }

  function setAuthStatus(message, kind) {
    const el = $("#auth-status");
    if (!el) return;
    el.textContent = message;
    el.dataset.kind = kind || "info";
  }
  function applyDashboardFeedback() {
    const el = $("#dashboard-feedback");
    const feedback = state.dashboardFeedback;
    if (!el || !feedback) return;
    el.hidden = false;
    el.textContent = feedback.message;
    el.dataset.kind = feedback.kind || "info";
  }
  function setDashboardFeedback(message, kind) {
    state.dashboardFeedback = { message: String(message), kind: kind || "info" };
    applyDashboardFeedback();
  }
  function errorText(error) {
    if (error == null) return "";
    if (typeof error === "string") return error;
    return [error.message, error.code, error.details, error.hint, error.error_description, error.status]
      .filter(function (part) { return part != null && part !== ""; })
      .map(String).join(" ");
  }
  function isMigrationMissing(error) {
    return MIGRATION_ERROR_PATTERN.test(errorText(error));
  }
  function friendlyError(error) {
    const raw = errorText(error) || "Erreur inconnue";
    for (const [pattern, message] of ERROR_MESSAGES) if (pattern.test(raw)) return message;
    return "Opération impossible : " + raw.replace(/[<>]/g, "").slice(0, 220);
  }
  function resolveEnvironment(config) {
    const detector = window.JotColisEnvironment && window.JotColisEnvironment.detectEnvironment;
    const detected = typeof detector === "function" ? detector({ window: window }) : null;
    const candidate = config && config.environment;
    if (candidate && typeof candidate === "object" &&
        ["development", "preview", "production"].includes(candidate.mode) &&
        typeof candidate.label === "string") {
      return candidate;
    }
    // Une configuration historique sous forme de chaîne n'est jamais une preuve
    // de production : on reste sur la détection sûre, par défaut « preview ».
    return detected || Object.freeze({
      mode: "preview",
      label: "Prévisualisation / environnement à qualifier",
      hostname: String(window.location && window.location.hostname || ""),
      reason: "configuration_absente_ou_heritee",
    });
  }
  function isValidPublicConfig(config) {
    if (!config || typeof config !== "object") return false;
    try {
      const url = new URL(String(config.url || ""));
      if (url.protocol !== "https:" || !/\.supabase\.co$/i.test(url.hostname)) return false;
      if (url.pathname !== "/" && url.pathname !== "") return false;
    } catch (_) { return false; }
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(config.publishableKey || ""))) return false;
    const serialised = JSON.stringify(config);
    if (/service_role|SUPABASE_SERVICE_ROLE_KEY|sb_secret_[A-Za-z0-9]{4,}|sk_live_[A-Za-z0-9]{4,}/i.test(serialised)) return false;
    return true;
  }
  function disableWhenBackendMissing(message) {
    $$("form[data-form] button[type=submit], #signup-form button, #signin-form button").forEach(function (button) {
      button.disabled = true;
    });
    setAuthStatus(message, "error");
    const root = $("#dashboard-root");
    if (root) root.innerHTML = '<div class="platform-alert platform-alert-error">' + esc(message) + "</div>";
  }

  async function rpc(name, args) {
    if (!state.client) throw new Error("BACKEND_UNAVAILABLE");
    const result = await state.client.rpc(name, args || {});
    if (result.error) {
      if (isMigrationMissing(result.error)) throw new Error("MIGRATIONS_MISSING");
      throw result.error;
    }
    return result.data;
  }
  async function select(tableName, builder) {
    if (!state.client) throw new Error("BACKEND_UNAVAILABLE");
    let query = state.client.from(tableName).select("*");
    if (builder) query = builder(query);
    const result = await query;
    if (result.error) {
      if (isMigrationMissing(result.error)) throw new Error("MIGRATIONS_MISSING");
      throw result.error;
    }
    return Array.isArray(result.data) ? result.data : [];
  }
  async function waitForSupabase() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (window.supabase && window.supabase.createClient && window.JOTCOLIS_CONFIG) return true;
      await new Promise(function (resolve) { setTimeout(resolve, 100); });
    }
    return false;
  }

  function renderComplianceBanner() {
    const banner = $("#compliance-banner");
    if (!banner) return;
    const config = state.me && state.me.config ? state.me.config : {};
    const open = config.commercial_open === true;
    banner.dataset.kind = open ? "warning" : "blocked";
    banner.textContent = open
      ? "Ouverture commerciale enregistrée en base. Vérifiez les validations juridiques documentées, les prestataires et la supervision avant tout transport réel."
      : "Service non ouvert au public : validations juridiques France/Sénégal, douanes, compagnies aériennes, assurances et notifications officielles en attente. Parcours techniques testables en préproduction uniquement.";
  }

  function renderSession(session) {
    const signedIn = Boolean(session && session.user);
    state.session = session;
    $("#signup-form").hidden = signedIn;
    $("#signin-form").hidden = signedIn;
    $("#account-session").hidden = !signedIn;
    $("#profile-panel").hidden = !signedIn;
    $("#dashboard-shell").hidden = !signedIn;
    if (homeLoginButtonRef) homeLoginButtonRef.hidden = signedIn;
    if (homeProfileButtonRef) homeProfileButtonRef.hidden = !signedIn;
    const emailLabel = $("#account-email");
    if (emailLabel) emailLabel.textContent = signedIn ? "Connecté : " + (session.user.email || "") : "";
    const verified = signedIn && Boolean(session.user.email_confirmed_at);
    const badge = $("#email-verification-badge");
    if (badge) {
      badge.hidden = !signedIn;
      badge.textContent = verified ? "Adresse e-mail confirmée" : "Adresse e-mail NON confirmée";
      badge.dataset.kind = verified ? "ok" : "warning";
    }
    const resend = $("#resend-verification-button");
    if (resend) resend.hidden = !signedIn || verified;
    if (!signedIn) {
      state.me = null; state.isAdmin = false; state.adminOverview = null;
      $("#dashboard-root").innerHTML = '<div class="platform-empty">Connectez-vous pour accéder à votre espace JotColis.</div>';
      setAuthStatus("Créez votre compte ou connectez-vous pour commencer.", "info");
    }
  }

  let homeLoginButtonRef = null;
  let homeProfileButtonRef = null;

  function renderProfileForm() {
    if (!state.me) return;
    const profile = state.me.profile || {};
    const form = $("#profile-form");
    if (!form) return;
    $("#profile-display-name").value = profile.display_name || "";
    $("#profile-phone").value = profile.phone || "";
    $("#profile-country").value = profile.country_code || "";
    const roles = (state.me.roles || []).join(", ") || "aucun";
    $("#profile-roles").textContent = "Rôles : " + roles + " · Statut du compte : " + statusLabel(profile.status);
    $("#profile-completion").textContent = profile.profile_completed_at
      ? "Profil complété. Les conditions ont été acceptées."
      : "Profil incomplet : renseignez vos coordonnées et acceptez les conditions.";
    $("#profile-terms").checked = Boolean(profile.terms_accepted_at);
    $("#profile-privacy").checked = Boolean(profile.privacy_accepted_at);
    $("#profile-terms").disabled = Boolean(profile.terms_accepted_at);
    $("#profile-privacy").disabled = Boolean(profile.privacy_accepted_at);
  }

  async function loadCorridors() {
    const select = $("#trip-corridor");
    if (!select) return;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.session ? "Choisissez une liaison" : "Connectez-vous pour charger les liaisons";
    select.appendChild(placeholder);
    if (!state.session) return;
    try {
      const corridors = await rpc("list_trip_corridors");
      state.corridors = Array.isArray(corridors) ? corridors : [];
      state.corridors.forEach(function (corridor) {
        const option = document.createElement("option");
        option.value = corridor.id;
        option.textContent = corridor.origin_label + " → " + corridor.destination_label +
          (corridor.is_active ? " · ouverte" : " · fermée (publication bloquée)");
        select.appendChild(option);
      });
    } catch (error) {
      placeholder.textContent = isMigrationMissing(error)
        ? "Migrations non appliquées : liaisons indisponibles"
        : "Liaisons indisponibles : backend non à jour";
      state.backendError = friendlyError(error);
    }
  }

  async function loadDashboardData() {
    const uid = state.me && state.me.user_id;
    if (!uid) return;
    const results = await Promise.allSettled([
      select("trips", function (q) { return q.order("created_at", { ascending: false }).limit(100); }),
      select("parcel_requests", function (q) { return q.order("created_at", { ascending: false }).limit(100); }),
      select("bookings", function (q) { return q.order("created_at", { ascending: false }).limit(100); }),
      select("passport_events", function (q) { return q.order("occurred_at", { ascending: false }).limit(200); }),
      select("incidents", function (q) { return q.order("created_at", { ascending: false }).limit(100); }),
      select("my_notifications", function (q) { return q.order("created_at", { ascending: false }).limit(100); }),
      select("delivery_code_status"),
      select("verification_documents", function (q) { return q.order("uploaded_at", { ascending: false }).limit(50); }),
      select("trip_alerts", function (q) { return q.order("created_at", { ascending: false }).limit(50); }),
      select("prohibited_categories", function (q) { return q.order("code"); })
    ]);
    const names = ["trips", "requests", "bookings", "passportEvents", "incidents", "notifications",
      "deliveryCodeStatus", "verificationDocuments", "tripAlerts", "prohibitedCategories"];
    const failures = [];
    results.forEach(function (result, index) {
      if (result.status === "fulfilled") state[names[index]] = result.value;
      else failures.push(names[index] + " : " + friendlyError(result.reason));
    });
    if (state.isAdmin) {
      try { state.adminOverview = await rpc("admin_overview"); }
      catch (error) { failures.push("admin_overview : " + friendlyError(error)); }
    } else {
      state.adminOverview = null;
    }
    state.backendError = failures.length ? "Certaines données n’ont pas pu être chargées : " + failures.join(" ; ") : null;
  }

  async function refresh() {
    if (!state.client) return;
    const sessionResult = await state.client.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    renderSession(sessionResult.data.session);
    if (!sessionResult.data.session) { renderComplianceBanner(); return; }
    try {
      state.me = await rpc("get_my_state");
      state.isAdmin = Boolean(state.me.is_admin);
      await loadDashboardData();
      renderProfileForm();
      renderDashboard();
      setAuthStatus(state.me.email_verified
        ? "Vous êtes connecté à votre espace JotColis."
        : "Connecté, mais votre adresse e-mail n’est pas confirmée.", state.me.email_verified ? "info" : "warning");
    } catch (error) {
      if (isMigrationMissing(error)) {
        state.backendError = MIGRATION_MESSAGE;
        disableWhenBackendMissing(MIGRATION_MESSAGE);
        renderComplianceBanner();
        return;
      }
      state.backendError = friendlyError(error);
      $("#dashboard-root").innerHTML =
        '<div class="platform-alert platform-alert-error">' +
        "<strong>Backend indisponible ou migrations non appliquées.</strong><br>" +
        esc(state.backendError) +
        "<br>Aucune donnée de démonstration n’est affichée. Appliquez les migrations Supabase puis rechargez." +
        "</div>";
      setAuthStatus("Connexion établie, mais le service métier n’est pas disponible.", "error");
    }
    renderComplianceBanner();
    await loadCorridors();
  }

  function tabBar() {
    const tabs = [
      ["overview", "Vue d’ensemble"], ["requests", "Demandes"], ["trips", "Trajets"],
      ["bookings", "Réservations"], ["passport", "Passeport"], ["incidents", "Incidents"],
      ["notifications", "Notifications"]
    ];
    if (state.isAdmin) tabs.push(["admin", "Administration"]);
    return '<div class="platform-tabs" role="tablist">' + tabs.map(function (t) {
      return '<button type="button" role="tab" data-action="tab" data-tab="' + t[0] + '"' +
        (state.activeTab === t[0] ? ' aria-selected="true" class="is-active"' : ' aria-selected="false"') +
        ">" + esc(t[1]) + "</button>";
    }).join("") + '<button type="button" class="platform-refresh" data-action="refresh">Actualiser</button></div>';
  }

  function renderDashboard() {
    const root = $("#dashboard-root");
    if (!root) return;
    if (!state.session || !state.me) return;
    let content = "";
    if (state.backendError) {
      content += '<div class="platform-alert platform-alert-warning">' + esc(state.backendError) + "</div>";
    }
    switch (state.activeTab) {
      case "requests": content += renderRequestsTab(); break;
      case "trips": content += renderTripsTab(); break;
      case "bookings": content += renderBookingsTab(); break;
      case "passport": content += renderPassportTab(); break;
      case "incidents": content += renderIncidentsTab(); break;
      case "notifications": content += renderNotificationsTab(); break;
      case "admin": content += state.isAdmin ? renderAdminTab() : '<div class="platform-alert platform-alert-error">Accès refusé.</div>'; break;
      default: content += renderOverviewTab();
    }
    root.innerHTML = tabBar() + '<div class="platform-feedback" id="dashboard-feedback" role="status" aria-live="polite" hidden></div>' + content;
    applyDashboardFeedback();
  }

  function renderOverviewTab() {
    const me = state.me || {};
    const profile = me.profile || {};
    const verification = me.gp_verification || null;
    const config = me.config || {};
    const providerStates = me.notification_provider_states || {};
    const rows = [
      ["Compte", me.email || "—"],
      ["E-mail confirmé", boolLabel(me.email_verified)],
      ["Profil complété", boolLabel(Boolean(profile.profile_completed_at))],
      ["Statut du compte", statusLabel(profile.status)],
      ["Rôles", (me.roles || []).join(", ") || "aucun"],
      ["Administrateur", boolLabel(me.is_admin)],
      ["Environnement", state.environment]
    ];
    const flags = [
      ["Ouverture commerciale", config.commercial_open],
      ["Validations juridiques", config.legal_validation_complete],
      ["Notifications externes", config.notifications_enabled],
      ["État e-mail", providerStateLabel((providerStates.email || {}).server_state || config.email_provider_state)],
      ["État WhatsApp", providerStateLabel((providerStates.whatsapp || {}).server_state || config.whatsapp_provider_state)],
      ["Tarification validée", config.pricing_config_validated]
    ];
    const checks = verification ? [
      ["Identité", verification.identity_status],
      ["Coordonnées", verification.contact_status],
      ["Voyage", verification.travel_status],
      ["Documents", verification.documents_status]
    ] : [];
    return '<div class="platform-grid">' +
      '<section class="platform-card"><h3>Mon compte</h3><dl class="platform-list">' +
        rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") +
      "</dl></section>" +
      '<section class="platform-card"><h3>Contrôles du dossier GP</h3>' +
        (verification
          ? '<p class="platform-status-line">Statut global : <strong>' + esc(statusLabel(verification.status)) + "</strong></p>" +
            '<dl class="platform-list">' + checks.map(function (c) {
              return "<dt>" + esc(c[0]) + "</dt><dd>" + esc(statusLabel(c[1])) + "</dd>";
            }).join("") + "</dl>" +
            "<p class=\"platform-small\">" + (verification.status === "approved"
              ? "Dossier approuvé par un administrateur. Cela ne constitue pas une validation juridique du transport."
              : "Aucun contrôle n’est considéré comme réalisé sans décision administrative enregistrée.") + "</p>"
          : '<p class="platform-empty">Aucun dossier de vérification GP soumis. Remplissez le formulaire ci-dessous.</p>') +
        gpVerificationForm() +
      "</section>" +
      '<section class="platform-card"><h3>État de l’exploitation</h3><dl class="platform-list">' +
        flags.map(function (f) { return "<dt>" + esc(f[0]) + "</dt><dd>" + esc(boolLabel(f[1])) + "</dd>"; }).join("") +
      "</dl><p class=\"platform-small\">Les drapeaux sont enregistrés côté serveur et audités. Ils ne remplacent pas une validation humaine documentée.</p></section>" +
      '<section class="platform-card"><h3>Marchandises interdites ou restreintes</h3>' +
        '<p class="platform-small">Liste indicative, non validée juridiquement. Un colis peut être refusé par le voyageur et par l’administration.</p>' +
        '<ul class="platform-list-bullets">' + (state.prohibitedCategories || []).map(function (c) {
          return "<li>" + esc(c.label) + " · " + esc(c.restriction) + " · " +
            (c.is_legally_validated ? "référence enregistrée" : "validation juridique manquante") + "</li>";
        }).join("") + "</ul></section>" +
      "</div>";
  }

  function gpVerificationForm() {
    return '<form class="platform-form" data-form="gp-verification" enctype="multipart/form-data">' +
      '<h4>Soumettre mon dossier GP</h4>' +
      '<div class="platform-form-grid">' +
        field("Prénom", "gp-first-name", "text", true) +
        field("Nom", "gp-last-name", "text", true) +
        field("Téléphone", "gp-phone", "tel", true, "+33 6 12 34 56 78") +
        field("Date de départ", "gp-departure", "date", true) +
        field("Destination", "gp-destination", "text", true, "Dakar") +
        field("Capacité proposée (kg)", "gp-capacity", "number", true, "20") +
        field("Référence du voyage", "gp-reference", "text", false, "Billet ou réservation") +
        field("Pièce d’identité (PDF ou image)", "gp-identity-file", "file", true) +
        field("Justificatif de voyage (facultatif)", "gp-travel-file", "file", false) +
      "</div>" +
      '<label class="platform-check"><input name="gp-terms" type="checkbox" required> Je certifie l’exactitude des informations et j’accepte le contrôle administrateur.</label>' +
      '<p class="platform-small">Documents stockés dans un bucket privé. Aucune approbation automatique : le statut reste « en attente ».</p>' +
      '<button class="button button-primary" type="submit">Soumettre pour contrôle</button>' +
    "</form>";
  }

  function field(label, name, type, required, placeholder) {
    const id = "field-" + name;
    const attrs = type === "number" ? ' min="0.5" max="500" step="0.5"' : "";
    return '<div class="platform-field"><label for="' + id + '">' + esc(label) + "</label>" +
      '<input id="' + id + '" name="' + name + '" type="' + type + '"' + attrs +
      (placeholder ? ' placeholder="' + esc(placeholder) + '"' : "") + (required ? " required" : "") + "></div>";
  }

  function renderRequestsTab() {
    const ownTripIds = new Set((state.trips || []).map(function (t) { return t.id; }));
    const uid = state.me.user_id;
    const rows = (state.requests || []).map(function (r) {
      const isSender = r.sender_id === uid;
      const isGp = ownTripIds.has(r.trip_id);
      let actions = "";
      if (isGp && r.status === "awaiting_gp") {
        actions += '<button class="button button-primary platform-mini-btn" type="button" data-action="accept-request" data-id="' + esc(r.id) + '">Accepter</button>';
        actions += '<form class="platform-inline-form" data-form="reject-request" data-id="' + esc(r.id) + '">' +
          '<input name="note" type="text" minlength="10" maxlength="500" placeholder="Motif du refus" required>' +
          '<button class="button button-secondary platform-mini-btn" type="submit">Refuser</button></form>';
      }
      const booking = (state.bookings || []).find(function (b) { return b.parcel_request_id === r.id; });
      if (isSender && booking && booking.status === "awaiting_confirmation") {
        actions += '<button class="button button-primary platform-mini-btn" type="button" data-action="confirm-booking" data-id="' + esc(booking.id) + '">Confirmer la réservation</button>';
      }
      if (booking) actions += '<button class="button button-secondary platform-mini-btn" type="button" data-action="select-booking" data-id="' + esc(booking.id) + '">Voir le passeport</button>';
      return "<tr><td>" + esc(r.parcel_code || "—") + "</td><td>" + esc(statusLabel(r.status)) + "</td><td>" +
        esc(r.origin_city) + " → " + esc(r.destination_city) + "</td><td>" + esc(UI.formatWeight(r.weight_kg)) +
        "</td><td>" + esc(r.declared_content || r.description || "") + "</td><td>" + esc(formatDate(r.created_at)) +
        "</td><td>" + actions + "</td></tr>";
    }).join("");
    return '<section class="platform-card"><h3>Mes demandes et demandes reçues</h3>' +
      '<p class="platform-small">Une demande enregistrée n’est pas une réservation. La capacité n’est réservée qu’après acceptation serveur.</p>' +
      (rows ? table(["Référence", "Statut", "Itinéraire", "Poids", "Contenu déclaré", "Créée le", "Actions"], rows)
        : '<p class="platform-empty">Aucune demande enregistrée.</p>') + "</section>";
  }

  function table(headers, rows) {
    return '<div class="platform-table-wrap"><table class="platform-table"><thead><tr>' +
      headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + rows + "</tbody></table></div>";
  }

  function renderTripsTab() {
    const approved = state.me.gp_verification && state.me.gp_verification.status === "approved";
    const rows = (state.trips || []).map(function (t) {
      let actions = "";
      if (t.status === "draft") {
        actions += '<button class="button button-primary platform-mini-btn" type="button" data-action="publish-trip" data-id="' + esc(t.id) + '">Publier</button>';
      }
      if (t.status === "draft" || t.status === "published") {
        actions += '<form class="platform-inline-form" data-form="cancel-trip" data-id="' + esc(t.id) + '">' +
          '<input name="reason" type="text" maxlength="500" placeholder="Motif (facultatif)">' +
          '<button class="button button-secondary platform-mini-btn" type="submit">Annuler</button></form>';
        actions += '<form class="platform-inline-form" data-form="edit-trip" data-id="' + esc(t.id) + '">' +
          '<input name="price" type="number" min="0" step="0.01" placeholder="Prix/kg" value="' + esc(t.price_per_kg ?? "") + '">' +
          '<input name="conditions" type="text" maxlength="300" placeholder="Conditions" value="' + esc(t.conditions ?? "") + '">' +
          '<button class="button button-secondary platform-mini-btn" type="submit">Modifier</button></form>';
      }
      return "<tr><td>" + esc(statusLabel(t.status)) + "</td><td>" + esc(t.origin_city) + " → " + esc(t.destination_city) +
        "</td><td>" + esc(formatDate(t.departure_at)) + "</td><td>" + esc(UI.formatWeight(t.capacity_total_kg)) +
        " / " + esc(UI.formatWeight(t.capacity_remaining_kg)) + " restants</td><td>" + esc(UI.formatPricePerKg(t.price_per_kg, t.currency)) +
        "</td><td>" + actions + "</td></tr>";
    }).join("");
    return '<section class="platform-card"><h3>Mes trajets</h3>' +
      (approved ? "" : '<p class="platform-alert platform-alert-warning">La publication est bloquée tant que votre dossier GP n’est pas approuvé par un administrateur et que la liaison n’est pas validée.</p>') +
      (rows ? table(["Statut", "Itinéraire", "Départ", "Capacité", "Tarif", "Actions"], rows)
        : '<p class="platform-empty">Aucun trajet enregistré.</p>') +
      '<p class="platform-small">La capacité est modifiable uniquement sur un brouillon sans réservation. Sur un trajet publié, seuls le prix et les conditions peuvent être ajustés.</p>' +
      "</section>";
  }

  function renderBookingsTab() {
    const uid = state.me.user_id;
    const rows = (state.bookings || []).map(function (b) {
      const isSender = b.sender_id === uid;
      const isGp = b.gp_id === uid;
      const codeStatus = (state.deliveryCodeStatus || []).find(function (c) { return c.booking_id === b.id; });
      let actions = "";
      if (isSender && b.status === "awaiting_confirmation") {
        actions += '<button class="button button-primary platform-mini-btn" type="button" data-action="confirm-booking" data-id="' + esc(b.id) + '">Confirmer</button>';
      }
      if (["awaiting_confirmation", "confirmed", "in_preparation", "in_transit", "arrived", "ready_for_pickup", "disputed"].includes(b.status)) {
        actions += '<form class="platform-inline-form" data-form="cancel-booking" data-id="' + esc(b.id) + '">' +
          '<input name="reason" type="text" maxlength="500" placeholder="Motif de l’annulation">' +
          '<button class="button button-secondary platform-mini-btn" type="submit">Annuler</button></form>';
      }
      if (isGp) {
        const options = eventOptions(b.status);
        if (options) {
          actions += '<form class="platform-inline-form" data-form="advance-booking" data-id="' + esc(b.id) + '">' +
            '<select name="event">' + options + "</select>" +
            '<input name="note" type="text" maxlength="300" placeholder="Note interne (facultatif)">' +
            '<button class="button button-primary platform-mini-btn" type="submit">Enregistrer l’étape</button></form>';
        }
      }
      if (b.status === "ready_for_pickup" && !codeStatus && !state.issuedCodes[b.id]) {
        actions += '<button class="button button-primary platform-mini-btn" type="button" data-action="issue-code" data-id="' + esc(b.id) + '">Générer le code de remise</button>';
      }
      if (state.issuedCodes[b.id]) {
        actions += '<div class="platform-code-box"><strong>Code à transmettre au destinataire :</strong> <code>' +
          esc(state.issuedCodes[b.id]) + "</code><p class=\"platform-small\">Affiché une seule fois. Aucun envoi automatique du code n’a eu lieu ; transmettez-le par votre propre canal sécurisé.</p></div>";
      } else if (codeStatus) {
        actions += '<p class="platform-small">Code ' + (codeStatus.used_at ? "utilisé" : codeStatus.revoked_at ? "révoqué" : "généré") +
          " · tentatives " + esc(codeStatus.attempts) + "/" + esc(codeStatus.max_attempts) + " · expire le " + esc(formatDate(codeStatus.expires_at)) + "</p>";
      }
      if (isGp && b.status === "ready_for_pickup") {
        actions += '<form class="platform-inline-form" data-form="verify-code" data-id="' + esc(b.parcel_code) + '">' +
          '<input name="code" type="text" maxlength="50" placeholder="Code communiqué par le destinataire" required>' +
          '<button class="button button-primary platform-mini-btn" type="submit">Vérifier le code</button></form>';
      }
      if (!["cancelled", "delivered"].includes(b.status)) {
        actions += '<form class="platform-inline-form" data-form="report-incident" data-id="' + esc(b.id) + '">' +
          '<select name="category">' +
            ["delay", "damaged_parcel", "missing_parcel", "handover", "conduct", "prohibited_content", "other"].map(function (c) {
              return '<option value="' + c + '">' + esc(c) + "</option>";
            }).join("") + "</select>" +
          '<input name="description" type="text" minlength="5" maxlength="500" placeholder="Description" required>' +
          '<button class="button button-secondary platform-mini-btn" type="submit">Signaler</button></form>';
      }
      actions += '<button class="button button-secondary platform-mini-btn" type="button" data-action="select-booking" data-id="' + esc(b.id) + '">Passeport</button>';
      return "<tr><td>" + esc(b.parcel_code || "—") + "</td><td>" + esc(statusLabel(b.status)) + "</td><td>" +
        esc(isSender ? "Expéditeur" : "Voyageur GP") + "</td><td>" + esc(UI.formatWeight(b.weight_kg)) +
        "</td><td>" + esc(formatMoney(b.agreed_price, b.currency)) + "</td><td>" + esc(formatDate(b.created_at)) +
        "</td><td>" + actions + "</td></tr>";
    }).join("");
    return '<section class="platform-card"><h3>Mes réservations</h3>' +
      '<p class="platform-small">La remise n’est terminée qu’après validation serveur du code. « Arrivée » ne signifie pas « remis ».</p>' +
      (rows ? table(["Référence", "Statut", "Rôle", "Poids", "Montant", "Créée le", "Actions"], rows)
        : '<p class="platform-empty">Aucune réservation.</p>') + "</section>";
  }

  function eventOptions(status) {
    const map = {
      confirmed: ["parcel_received", "inspection_recorded"],
      in_preparation: ["inspection_recorded", "departure_reported"],
      in_transit: ["arrival_reported"],
      arrived: ["ready_for_pickup", "handover_reported"],
      ready_for_pickup: ["handover_reported"]
    };
    const list = map[status] || [];
    return list.length ? list.map(function (e) { return '<option value="' + e + '">' + esc(eventLabel(e)) + "</option>"; }).join("") : "";
  }

  function renderPassportTab() {
    let events = state.passportEvents || [];
    if (state.selectedBookingId) {
      const booking = (state.bookings || []).find(function (b) { return b.id === state.selectedBookingId; });
      if (booking) events = events.filter(function (e) { return e.booking_id === booking.id || e.parcel_code === booking.parcel_code; });
    }
    const rows = events.map(function (e) {
      return '<div class="timeline-event complete"><span class="timeline-marker">✓</span><div><strong>' +
        esc(e.payload && e.payload.label ? e.payload.label : eventLabel(e.event_type)) + "</strong><p>" +
        esc(formatDate(e.occurred_at)) + " · " + esc(e.source) + " · séquence " + esc(e.sequence_no) +
        " · empreinte " + esc(String(e.event_hash || "").slice(0, 12)) + "…</p></div></div>";
    }).join("");
    return '<section class="platform-card"><h3>Passeport numérique du colis</h3>' +
      '<p class="platform-small">Événements réels horodatés par le serveur, chaînés par empreinte et protégés contre toute modification. Aucun événement illustratif.</p>' +
      (state.selectedBookingId ? '<button class="button button-secondary platform-mini-btn" type="button" data-action="tab" data-tab="passport">Afficher tous les événements</button>' : "") +
      (rows ? '<div class="timeline">' + rows + "</div>" : '<p class="platform-empty">Aucun événement enregistré.</p>') +
      "</section>";
  }

  function renderIncidentsTab() {
    const rows = (state.incidents || []).map(function (i) {
      return "<tr><td>" + esc(i.internal_reference || i.id) + "</td><td>" + esc(i.category) + "</td><td>" +
        esc(statusLabel(i.status)) + "</td><td>" + esc(i.priority) + "</td><td>" + esc(formatDate(i.created_at)) + "</td></tr>";
    }).join("");
    return '<section class="platform-card"><h3>Incidents et signalements</h3>' +
      (rows ? table(["Référence", "Catégorie", "Statut", "Priorité", "Ouvert le"], rows)
        : '<p class="platform-empty">Aucun incident enregistré.</p>') +
      '<p class="platform-small">Les notes internes et l’affectation sont réservées à l’administration.</p></section>';
  }

  function renderNotificationsTab() {
    const rows = (state.notifications || []).map(function (n) {
      return "<tr><td>" + esc(n.event_type) + "</td><td>" + esc(n.channel) + "</td><td>" +
        esc(statusLabel(n.status)) + "</td><td>" + esc(n.attempts) + "</td><td>" + esc(formatDate(n.created_at)) +
        "</td><td>" + esc(n.last_error || "—") + "</td></tr>";
    }).join("");
    const blocked = (state.notifications || []).filter(function (n) { return n.status === "blocked"; }).length;
    return '<section class="platform-card"><h3>Historique des notifications</h3>' +
      '<div class="platform-alert platform-alert-warning">Les lignes « bloqué (aucun envoi) » correspondent à des événements enregistrés sans canal serveur opérationnel. Aucun e-mail ni message WhatsApp n’est prétendu envoyé ; une déclaration administrateur n’active jamais un canal.</div>' +
      '<p class="platform-small">Lignes bloquées : ' + esc(blocked) + ".</p>" +
      (rows ? table(["Événement", "Canal", "Statut", "Tentatives", "Créée le", "Motif"], rows)
        : '<p class="platform-empty">Aucune notification.</p>') +
      "</section>";
  }

  function optionsFrom(items, valueKey, labelFn, placeholder) {
    return '<option value="">' + esc(placeholder || "Choisir…") + "</option>" + (items || []).map(function (item) {
      return '<option value="' + esc(item[valueKey]) + '">' + esc(labelFn(item)) + "</option>";
    }).join("");
  }

  function renderAdminTab() {
    const o = state.adminOverview || {};
    const counts = o.counts || {};
    const users = o.profiles || [];
    const verifications = o.gp_verifications || [];
    const corridors = o.corridors || [];
    const trips = o.trips || [];
    const incidents = o.incidents || [];
    const bookings = o.bookings || [];
    const categories = o.prohibited_categories || [];
    const legal = o.legal_validations || [];
    const audit = o.audit_logs || [];
    const notifications = o.notifications || [];
    const config = o.platform_config || {};
    const providerStates = o.notification_provider_states || [];
    const providerRows = providerStates.map(function (p) {
      return "<tr><td>" + esc(p.channel) + "</td><td>" + esc(p.declared_provider_name || "—") +
        "</td><td>" + esc(providerStateLabel(p.server_state)) + "</td><td>" + esc(boolLabel(p.declared_active)) +
        "</td><td>" + esc(boolLabel(p.secrets_present)) + "</td><td>" + esc(p.last_error || "—") + "</td></tr>";
    }).join("");
    const userOptions = optionsFrom(users, "id", function (u) { return (u.display_name || u.id.slice(0, 8)) + " · " + statusLabel(u.status); }, "Choisir un compte");
    return '<div class="platform-grid">' +
      '<section class="platform-card"><h3>Tableau de bord administration</h3><dl class="platform-list">' +
        ["profiles", "pending_gp", "trips", "requests", "bookings", "open_incidents", "blocked_notifications"].map(function (key) {
          return "<dt>" + esc(key) + "</dt><dd>" + esc(counts[key] ?? 0) + "</dd>";
        }).join("") + "</dl>" +
        '<p class="platform-small">Drapeaux serveur : ' + esc(Object.keys(config).map(function (k) { return k + "=" + JSON.stringify(config[k]); }).join(" · ")) + "</p>" +
        (providerRows ? table(["Canal", "Prestataire déclaré", "État serveur", "Déclaration", "Secrets serveur", "Dernier code"], providerRows)
          : '<p class="platform-empty">Aucun état de prestataire disponible.</p>') + "</section>" +
      '<section class="platform-card"><h3>Contrôle GP</h3>' +
        '<form class="platform-form" data-form="admin-review-gp">' +
          '<label>Compte<select name="user_id" required>' + userOptions + "</select></label>" +
          '<label>Décision<select name="decision"><option value="approved">Approuver</option><option value="rejected">Refuser</option><option value="suspended">Suspendre</option><option value="in_review">Vérification en cours</option></select></label>' +
          '<label>Note / motif<textarea name="note" rows="2" maxlength="500" placeholder="Obligatoire pour refus ou suspension"></textarea></label>' +
          '<div class="platform-form-grid">' +
            adminSelect("Identité", "identity_status") + adminSelect("Coordonnées", "contact_status") +
            adminSelect("Voyage", "travel_status") + adminSelect("Documents", "documents_status") +
          "</div>" +
          '<label>Expiration (facultatif)<input name="expires_at" type="date"></label>' +
          '<button class="button button-primary" type="submit">Enregistrer la décision</button>' +
        "</form>" +
        '<p class="platform-small">Approbation interdite sur son propre compte par le serveur.</p></section>' +
      '<section class="platform-card"><h3>Validations juridiques et exploitation</h3>' +
        '<form class="platform-form" data-form="admin-record-legal">' +
          '<div class="platform-form-grid">' +
            '<label>Juridiction<select name="jurisdiction"><option value="FR">France</option><option value="SN">Sénégal</option><option value="EU">UE</option><option value="OTHER">Autre</option></select></label>' +
            '<label>Portée<select name="scope"><option value="business_model">Modèle économique et juridique</option><option value="transport_rules">Transport</option><option value="customs">Douanes</option><option value="airline">Compagnies aériennes</option><option value="insurance">Assurances</option><option value="privacy">Protection des données</option><option value="terms">Conditions générales</option></select></label>' +
          "</div>" +
          field("Professionnel compétent", "professional", "text", true) +
          field("Référence du document", "document_ref", "text", true) +
          '<button class="button button-primary" type="submit">Enregistrer la validation</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-validate-category">' +
          '<label>Catégorie<select name="code" required>' + optionsFrom(categories, "code", function (c) { return c.label; }, "Choisir une catégorie") + "</select></label>" +
          field("Référence de validation", "reference", "text", true) +
          field("Motif", "reason", "text", true) +
          '<button class="button button-secondary" type="submit">Marquer validée juridiquement</button>' +
        "</form>" +
        '<div class="platform-alert platform-alert-warning">La déclaration administrative n’active aucun envoi. Les secrets sont vérifiés côté serveur ; « testé » exige une confirmation prestataire et « opérationnel » une activation service_role explicite.</div>' +
        '<form class="platform-form" data-form="admin-provider-config">' +
          '<label>Canal<select name="channel"><option value="email">E-mail</option><option value="whatsapp">WhatsApp Cloud API officielle</option></select></label>' +
          field("Nom du prestataire déclaré", "provider", "text", true) +
          field("Justification", "reason", "text", true) +
          '<label class="platform-check"><input name="configured" type="checkbox" checked> Déclaration administrative active (aucun secret dans ce formulaire)</label>' +
          '<button class="button button-secondary" type="submit">Enregistrer la déclaration</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-platform-flag">' +
          '<label>Drapeau<select name="key"><option value="legal_validation_complete">Validations juridiques complètes</option><option value="pricing_config_validated">Tarification validée</option><option value="commercial_open">Ouverture commerciale</option></select></label>' +
          '<p class="platform-small">L’activation des notifications externes n’est pas un drapeau administrateur : elle est dérivée d’un état serveur opérationnel.</p>' +
          field("Motif détaillé", "reason", "text", true) +
          '<label class="platform-check"><input name="value" type="checkbox" checked> Activer</label>' +
          '<button class="button button-primary" type="submit">Modifier le drapeau</button>' +
        "</form></section>" +
      '<section class="platform-card"><h3>Liaisons et offres</h3>' +
        '<form class="platform-form" data-form="admin-corridor">' +
          '<label>Liaison<select name="corridor_id" required>' + optionsFrom(corridors, "id", function (c) { return c.origin_label + " → " + c.destination_label; }, "Choisir une liaison") + "</select></label>" +
          field("Référence juridique", "legal_ref", "text", false) +
          field("Motif", "reason", "text", true) +
          '<label class="platform-check"><input name="active" type="checkbox" checked> Activer la liaison</label>' +
          '<button class="button button-primary" type="submit">Appliquer</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-suspend-trip">' +
          '<label>Trajet<select name="trip_id" required>' + optionsFrom(trips, "id", function (t) { return t.origin_city + " → " + t.destination_city + " · " + statusLabel(t.status); }, "Choisir un trajet") + "</select></label>" +
          field("Motif de suspension", "reason", "text", true) +
          '<button class="button button-secondary" type="submit">Suspendre le trajet</button>' +
        "</form></section>" +
      '<section class="platform-card"><h3>Comptes et rôles</h3>' +
        '<form class="platform-form" data-form="admin-account-status">' +
          '<label>Compte<select name="user_id" required>' + userOptions + "</select></label>" +
          '<label>Statut<select name="status"><option value="active">Actif</option><option value="suspended">Suspendu</option><option value="closed">Clôturé</option></select></label>' +
          field("Motif", "reason", "text", false) +
          '<button class="button button-secondary" type="submit">Modifier le statut</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-role">' +
          '<label>Compte<select name="user_id" required>' + userOptions + "</select></label>" +
          '<label>Rôle<select name="role"><option value="recipient">Destinataire</option><option value="gp">Voyageur GP</option><option value="sender">Expéditeur</option><option value="admin">Administrateur</option></select></label>' +
          field("Motif", "reason", "text", true) +
          '<label class="platform-check"><input name="revoke" type="checkbox"> Révoquer au lieu d’accorder</label>' +
          '<button class="button button-secondary" type="submit">Appliquer</button>' +
        "</form></section>" +
      '<section class="platform-card"><h3>Incidents et procédure de secours</h3>' +
        '<form class="platform-form" data-form="admin-assign-incident">' +
          '<label>Incident<select name="incident_id" required>' + optionsFrom(incidents, "id", function (i) { return i.internal_reference || i.id; }, "Choisir un incident") + "</select></label>" +
          '<label>Affecter à<select name="assigned_to" required>' + userOptions + "</select></label>" +
          '<button class="button button-secondary" type="submit">Affecter</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-resolve-incident">' +
          '<label>Incident<select name="incident_id" required>' + optionsFrom(incidents, "id", function (i) { return i.internal_reference || i.id; }, "Choisir un incident") + "</select></label>" +
          '<label>Résolution<textarea name="resolution" rows="2" minlength="10" required></textarea></label>' +
          '<button class="button button-primary" type="submit">Clore l’incident</button>' +
        "</form>" +
        '<form class="platform-form" data-form="admin-handover">' +
          '<label>Réservation<select name="booking_id" required>' + optionsFrom(bookings, "id", function (b) { return (b.parcel_code || b.id) + " · " + statusLabel(b.status); }, "Choisir une réservation") + "</select></label>" +
          '<label>Motif détaillé<textarea name="reason" rows="2" minlength="15" required></textarea></label>' +
          '<button class="button button-secondary" type="submit">Valider une remise par procédure de secours</button>' +
        "</form></section>" +
      '<section class="platform-card"><h3>Validations enregistrées</h3>' +
        (legal.length ? "<ul class=\"platform-list-bullets\">" + legal.map(function (l) {
          return "<li>" + esc(l.jurisdiction) + " · " + esc(l.scope) + " · " + esc(l.professional_name) + " · " + esc(l.document_ref) + "</li>";
        }).join("") + "</ul>" : '<p class="platform-empty">Aucune validation juridique enregistrée.</p>') + "</section>" +
      '<section class="platform-card"><h3>Notifications (statut réel)</h3>' +
        (notifications.length ? "<ul class=\"platform-list-bullets\">" + notifications.slice(0, 20).map(function (n) {
          return "<li>" + esc(n.event_type) + " · " + esc(n.channel) + " · " + esc(statusLabel(n.status)) + " · tentatives " + esc(n.attempts) + "</li>";
        }).join("") + "</ul>" : '<p class="platform-empty">Aucune notification.</p>') + "</section>" +
      '<section class="platform-card"><h3>Journal d’audit</h3>' +
        (audit.length ? "<ul class=\"platform-list-bullets\">" + audit.slice(0, 30).map(function (a) {
          return "<li>" + esc(formatDate(a.created_at)) + " · " + esc(a.actor_role || "—") + " · " + esc(a.action) + " · " + esc(a.entity_type) + "</li>";
        }).join("") + "</ul>" : '<p class="platform-empty">Aucune action sensible enregistrée.</p>') + "</section>" +
      "</div>";
  }

  function adminSelect(label, name) {
    return '<label>' + esc(label) + '<select name="' + name + '">' +
      '<option value="not_checked">Contrôle non réalisé</option><option value="pending">En attente</option>' +
      '<option value="checked" selected>Contrôlé</option><option value="failed">Échec</option></select></label>';
  }

  async function handleAction(action, dataset) {
    switch (action) {
      case "tab":
        state.activeTab = dataset.tab || "overview";
        if (dataset.tab === "passport") state.selectedBookingId = null;
        renderDashboard();
        return;
      case "refresh": await refresh(); return;
      case "signout": {
        const { error } = await state.client.auth.signOut();
        if (error) throw error;
        state.me = null; state.session = null; state.isAdmin = false;
        renderSession(null);
        setAuthStatus("Vous êtes déconnecté.", "info");
        return;
      }
      case "forgot-password": {
        const form = $("#forgot-password-form");
        if (form) {
          form.hidden = !form.hidden;
          form.scrollIntoView({ behavior: "smooth", block: "center" });
          form.querySelector("input[name=email]")?.focus();
        }
        return;
      }
      case "resend-verification": {
        const email = state.session.user.email;
        const { error } = await state.client.auth.resend({ type: "signup", email: email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
        if (error) throw error;
        setAuthStatus("Demande de confirmation transmise à Supabase Auth. Aucun envoi d’e-mail n’est confirmé par cette interface.", "info");
        return;
      }
      case "publish-trip":
        await rpc("publish_my_trip", { p_trip_id: dataset.id });
        setDashboardFeedback("Trajet publié en base. Il apparaît dans la recherche si toutes les conditions serveur restent réunies.", "ok");
        await refresh(); return;
      case "accept-request":
        await rpc("respond_to_request", { p_request_id: dataset.id, p_accept: true, p_note: null });
        setDashboardFeedback("Demande acceptée : capacité réservée atomiquement, réservation en attente de confirmation de l’expéditeur.", "ok");
        await refresh(); return;
      case "confirm-booking":
        await rpc("confirm_booking", { p_booking_id: dataset.id });
        setDashboardFeedback("Réservation confirmée. Le colis n’est pas encore pris en charge.", "ok");
        await refresh(); return;
      case "issue-code": {
        const code = await rpc("issue_delivery_code", { p_booking_id: dataset.id });
        state.issuedCodes[dataset.id] = code;
        renderDashboard();
        setDashboardFeedback("Code généré côté serveur et affiché une seule fois. Aucun envoi automatique au destinataire n’a eu lieu : transmettez-le par votre propre canal sécurisé.", "warning");
        return;
      }
      case "select-booking":
        state.selectedBookingId = dataset.id;
        state.activeTab = "passport";
        renderDashboard(); return;
      default:
        throw new Error("ACTION_INCONNUE:" + action);
    }
  }

  async function handleForm(name, form, data) {
    const id = form.dataset.id || "";
    switch (name) {
      case "signup": {
        const displayName = value(data, "display_name");
        const email = value(data, "email");
        const password = data.get("password") || "";
        if (!displayName || password.length < 8) throw new Error("INVALID_SIGNUP");
        const result = await state.client.auth.signUp({
          email: email, password: password,
          options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + window.location.pathname }
        });
        if (result.error) throw result.error;
        setAuthStatus(result.data.session
          ? "Compte créé et session ouverte. Vérifiez la confirmation de votre adresse e-mail."
          : "Inscription enregistrée dans Supabase Auth. Si la confirmation par e-mail est configurée, validez le lien reçu ; aucun envoi n’est confirmé par cette page.", "info");
        await refresh(); return;
      }
      case "signin": {
        const result = await state.client.auth.signInWithPassword({ email: value(data, "email"), password: data.get("password") || "" });
        if (result.error) throw result.error;
        setAuthStatus("Connexion réussie.", "ok");
        await refresh(); return;
      }
      case "forgot-password": {
        const email = value(data, "email") || (state.session && state.session.user.email) || "";
        if (!email) throw new Error("EMAIL_REQUIRED");
        const result = await state.client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + "#compte" });
        if (result.error) throw result.error;
        setAuthStatus("Demande de réinitialisation transmise à Supabase Auth. Si le compte existe et si l’envoi est configuré, un lien sera reçu. Aucun envoi n’est confirmé ici.", "info");
        return;
      }
      case "reset-password": {
        const password = data.get("new_password") || "";
        if (password.length < 8) throw new Error("INVALID_PASSWORD");
        const result = await state.client.auth.updateUser({ password: password });
        if (result.error) throw result.error;
        $("#reset-password-form").hidden = true;
        setAuthStatus("Mot de passe mis à jour dans Supabase Auth.", "ok");
        await refresh(); return;
      }
      case "profile": {
        await rpc("update_my_profile", {
          p_display_name: value(data, "display_name"), p_phone: value(data, "phone"),
          p_country_code: value(data, "country_code") || null,
          p_accept_terms: true, p_accept_privacy: true
        });
        setDashboardFeedback("Profil enregistré en base.", "ok");
        await refresh(); return;
      }
      case "search-trips": {
        const origin = value(data, "origin");
        const destination = value(data, "destination");
        const date = value(data, "travel-date") || null;
        const weight = value(data, "weight");
        const searchFeedback = $("#search-feedback");
        searchFeedback.hidden = false;
        searchFeedback.textContent = "Recherche des trajets réellement publiés…";
        try {
          const trips = await rpc("search_trips", {
            p_origin: origin, p_destination: destination, p_date: date,
            p_min_capacity: weight && weight !== "any" ? Number(weight) : null
          });
          UI.renderTrips(trips || [], { origin: origin, destination: destination, date: date });
          searchFeedback.textContent = (trips || []).length
            ? (trips || []).length + " trajet(s) publié(s) trouvé(s) dans Supabase."
            : "Aucun trajet publié ne correspond. Aucun exemple fictif n’est affiché.";
        } catch (error) {
          searchFeedback.textContent = "Recherche indisponible : " + friendlyError(error) + " Aucun exemple fictif n’est affiché.";
          UI.renderEmptyState($("#trip-results"), { origin: origin, destination: destination, date: date });
        }
        $("#resultats")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      case "create-trip": {
        if (!state.session) { UI.openProfileView(); setAuthStatus("Connectez-vous pour enregistrer un trajet.", "warning"); return; }
        const date = value(data, "trip-date");
        const time = value(data, "trip-time") || "12:00";
        const departure = date ? new Date(date + "T" + time + ":00").toISOString() : null;
        const capacity = Number(value(data, "trip-capacity"));
        const priceText = value(data, "trip-price");
        const tripId = await rpc("create_trip_draft", {
          p_corridor_id: value(data, "trip-corridor"), p_origin_city: value(data, "trip-origin"),
          p_destination_city: value(data, "trip-destination"), p_departure_at: departure,
          p_capacity_kg: capacity, p_currency: value(data, "trip-currency") || "EUR",
          p_price_per_kg: priceText === "" ? null : Number(priceText),
          p_conditions: value(data, "trip-conditions") || null
        });
        let message = "Brouillon enregistré en base (réf. " + tripId + "). Il n’est pas visible dans la recherche.";
        if (checked(data, "publish-now")) {
          try {
            await rpc("publish_my_trip", { p_trip_id: tripId });
            message = "Trajet publié en base (réf. " + tripId + "). La recherche n’affiche que les offres remplissant toutes les conditions serveur.";
          } catch (error) {
            message = "Brouillon enregistré (réf. " + tripId + "). Publication bloquée : " + friendlyError(error);
          }
        }
        $("#trip-feedback").innerHTML = esc(message);
        form.reset();
        $("#trip-capacity").value = "5";
        await loadCorridors();
        await refresh(); return;
      }
      case "submit-request": {
        if (!state.selectedTrip || !state.session) throw new Error("SESSION_REQUIRED");
        const code = await rpc("submit_parcel_request", {
          p_trip_id: state.selectedTrip.id,
          p_description: value(data, "description"),
          p_declared_content: value(data, "declared_content"),
          p_weight_kg: Number(value(data, "weight")),
          p_recipient_name: value(data, "recipient_name"),
          p_recipient_contact: value(data, "recipient_contact"),
          p_sender_contact: value(data, "sender_contact"),
          p_terms_accepted: checked(data, "terms"),
          p_prohibited_confirmed: checked(data, "prohibited"),
          p_idempotency_key: state.requestIdempotencyKey,
          p_length_cm: value(data, "length") ? Number(value(data, "length")) : null,
          p_width_cm: value(data, "width") ? Number(value(data, "width")) : null,
          p_height_cm: value(data, "height") ? Number(value(data, "height")) : null,
          p_message: value(data, "message") || null
        });
        const feedback = $("#contact-gp-feedback");
        feedback.hidden = false;
        feedback.dataset.kind = "ok";
        feedback.innerHTML = "Demande enregistrée dans Supabase. Référence colis : <strong>" + esc(code) +
          "</strong>. Statut : en attente du voyageur. Aucun message externe n’est confirmé envoyé.";
        form.querySelector('button[type="submit"]').disabled = true;
        form.querySelector('button[type="submit"]').dataset.submitted = "true";
        await refresh(); return;
      }
      case "track-parcel": {
        const code = value(data, "parcel_code");
        const events = await rpc("get_parcel_passport", { p_parcel_code: code });
        const container = $("#parcel-track-results");
        const trackFeedback = $("#parcel-track-feedback");
        trackFeedback.hidden = false;
        if (!events || !events.length) {
          container.innerHTML = "";
          trackFeedback.textContent = "Aucun événement public pour ce code. Vérifiez la référence ou attendez la confirmation du colis.";
          return;
        }
        trackFeedback.textContent = "Statut actuel : " + statusLabel(events[0].current_status) + " · " + events.length + " événement(s) autorisé(s).";
        container.innerHTML = events.map(function (e, index) {
          return '<div class="timeline-event ' + (index === events.length - 1 ? "current" : "complete") + '">' +
            '<span class="timeline-marker">' + (index === events.length - 1 ? "•" : "✓") + "</span><div><strong>" +
            esc(e.label || eventLabel(e.event_type)) + "</strong><p>" + esc(formatDate(e.occurred_at)) +
            " · référence " + esc(e.parcel_code) + "</p></div></div>";
        }).join("");
        return;
      }
      case "trip-alert": {
        await rpc("create_trip_alert", {
          p_origin_city: form.dataset.origin || "", p_destination_city: form.dataset.destination || "",
          p_contact: value(data, "contact"), p_consent: checked(data, "consent"),
          p_date: form.dataset.date || null
        });
        const alertFeedback = $("#gp-alert-feedback");
        if (alertFeedback) {
          alertFeedback.hidden = false;
          alertFeedback.textContent = "Alerte enregistrée en base. Aucun e-mail ni message WhatsApp n’est envoyé sans prestataire officiel configuré.";
        }
        await refresh(); return;
      }
      case "gp-verification": {
        const uid = state.me.user_id;
        const idempotency = crypto.randomUUID();
        const identity = form.querySelector("#field-gp-identity-file").files[0];
        const travel = form.querySelector("#field-gp-travel-file").files[0];
        if (!identity) throw new Error("DOCUMENT_REQUIRED");
        const identityPath = uid + "/" + idempotency + "-identity-" + safeFileName(identity.name);
        let upload = await state.client.storage.from("gp-documents").upload(identityPath, identity, { contentType: identity.type, upsert: false });
        if (upload.error) throw upload.error;
        let travelPath = null, travelType = null, travelSize = null;
        if (travel) {
          travelPath = uid + "/" + crypto.randomUUID() + "-travel-" + safeFileName(travel.name);
          upload = await state.client.storage.from("gp-documents").upload(travelPath, travel, { contentType: travel.type, upsert: false });
          if (upload.error) throw upload.error;
          travelType = travel.type || null; travelSize = travel.size;
        }
        const departure = value(data, "gp-departure");
        await rpc("submit_gp_verification", {
          p_legal_first_name: value(data, "gp-first-name"), p_legal_last_name: value(data, "gp-last-name"),
          p_phone: value(data, "gp-phone"),
          p_travel_departure_at: departure ? new Date(departure + "T12:00:00").toISOString() : null,
          p_travel_destination: value(data, "gp-destination"),
          p_travel_capacity_kg: Number(value(data, "gp-capacity")),
          p_identity_doc_path: identityPath, p_idempotency_key: idempotency,
          p_travel_reference: value(data, "gp-reference") || null,
          p_justification_note: null, p_travel_doc_path: travelPath,
          p_identity_content_type: identity.type || null, p_identity_size_bytes: identity.size,
          p_travel_content_type: travelType, p_travel_size_bytes: travelSize,
          p_accept_terms: checked(data, "gp-terms")
        });
        form.reset();
        setDashboardFeedback("Dossier soumis et enregistré. Statut : en attente de vérification. Aucun contrôle n’a été effectué automatiquement.", "ok");
        await refresh(); return;
      }
      case "edit-trip": {
        const patch = {};
        const price = value(data, "price");
        if (price !== "") patch.price_per_kg = Number(price);
        if (form.querySelector('[name="conditions"]')) patch.conditions = value(data, "conditions");
        await rpc("update_my_trip", { p_trip_id: id, p_patch: patch });
        setDashboardFeedback("Offre mise à jour côté serveur.", "ok");
        await refresh(); return;
      }
      case "cancel-trip":
        await rpc("cancel_my_trip", { p_trip_id: id, p_reason: value(data, "reason") || null });
        setDashboardFeedback("Trajet annulé en base.", "ok");
        await refresh(); return;
      case "reject-request":
        await rpc("respond_to_request", { p_request_id: id, p_accept: false, p_note: value(data, "note") || null });
        setDashboardFeedback("Demande refusée et historisée.", "ok");
        await refresh(); return;
      case "cancel-booking":
        await rpc("cancel_booking", { p_booking_id: id, p_reason: value(data, "reason") || null });
        setDashboardFeedback("Réservation annulée ; capacité libérée une seule fois si elle était réservée.", "ok");
        await refresh(); return;
      case "advance-booking":
        await rpc("advance_booking", { p_booking_id: id, p_event_type: value(data, "event"), p_note: value(data, "note") || null });
        setDashboardFeedback("Étape réelle enregistrée dans le passeport.", "ok");
        await refresh(); return;
      case "verify-code": {
        const ok = await rpc("verify_delivery_code", { p_parcel_code: id, p_code: value(data, "code") });
        if (!ok) {
          setDashboardFeedback("Code invalide : tentative enregistrée, aucune remise confirmée.", "error");
        } else {
          setDashboardFeedback("Code vérifié côté serveur : remise effectuée et événement enregistré.", "ok");
          delete state.issuedCodes[id];
        }
        await refresh(); return;
      }
      case "report-incident":
        await rpc("report_incident", { p_booking_id: id, p_category: value(data, "category"), p_description: value(data, "description") });
        setDashboardFeedback("Incident enregistré et signalé à l’administration.", "ok");
        await refresh(); return;
      case "admin-review-gp":
        await rpc("admin_review_gp", {
          p_user_id: value(data, "user_id"), p_decision: value(data, "decision"),
          p_note: value(data, "note") || null, p_identity_status: value(data, "identity_status"),
          p_contact_status: value(data, "contact_status"), p_travel_status: value(data, "travel_status"),
          p_documents_status: value(data, "documents_status"),
          p_expires_at: value(data, "expires_at") ? new Date(value(data, "expires_at") + "T23:59:59").toISOString() : null
        });
        setDashboardFeedback("Décision GP enregistrée et auditée.", "ok");
        await refresh(); return;
      case "admin-record-legal":
        await rpc("admin_record_legal_validation", {
          p_jurisdiction: value(data, "jurisdiction"), p_scope: value(data, "scope"),
          p_professional_name: value(data, "professional"), p_document_ref: value(data, "document_ref"),
          p_notes: null
        });
        setDashboardFeedback("Validation juridique enregistrée (déclaration administrative, pas une validation automatique du modèle).", "ok");
        await refresh(); return;
      case "admin-validate-category":
        await rpc("admin_validate_prohibited_category", {
          p_code: value(data, "code"), p_validation_reference: value(data, "reference"), p_reason: value(data, "reason")
        });
        setDashboardFeedback("Catégorie marquée validée avec référence.", "ok");
        await refresh(); return;
      case "admin-provider-config":
        await rpc("admin_set_provider_config", {
          p_channel: value(data, "channel"), p_configured: checked(data, "configured"),
          p_provider_name: value(data, "provider"), p_reason: value(data, "reason")
        });
        setDashboardFeedback("Déclaration enregistrée et auditée. Aucun canal n’a été activé et aucun secret n’a été transmis.", "ok");
        await refresh(); return;
      case "admin-platform-flag":
        await rpc("admin_set_platform_flag", {
          p_key: value(data, "key"), p_value: checked(data, "value"), p_reason: value(data, "reason")
        });
        setDashboardFeedback("Drapeau serveur modifié et audité.", "ok");
        await refresh(); return;
      case "admin-corridor":
        await rpc("admin_set_corridor_active", {
          p_corridor_id: value(data, "corridor_id"), p_active: checked(data, "active"),
          p_legal_validation_ref: value(data, "legal_ref") || null, p_reason: value(data, "reason")
        });
        setDashboardFeedback("Liaison mise à jour et auditée.", "ok");
        await refresh(); return;
      case "admin-suspend-trip":
        await rpc("admin_suspend_trip", { p_trip_id: value(data, "trip_id"), p_reason: value(data, "reason") });
        setDashboardFeedback("Trajet suspendu et audité.", "ok");
        await refresh(); return;
      case "admin-account-status":
        await rpc("admin_set_account_status", {
          p_user_id: value(data, "user_id"), p_status: value(data, "status"), p_reason: value(data, "reason") || null
        });
        setDashboardFeedback("Statut du compte modifié et audité.", "ok");
        await refresh(); return;
      case "admin-role": {
        const roleArgs = { p_user_id: value(data, "user_id"), p_role: value(data, "role"), p_reason: value(data, "reason") };
        if (checked(data, "revoke")) await rpc("admin_revoke_role", roleArgs);
        else await rpc("admin_grant_role", roleArgs);
        setDashboardFeedback("Rôle mis à jour et audité.", "ok");
        await refresh(); return;
      }
      case "admin-assign-incident":
        await rpc("admin_assign_incident", {
          p_incident_id: value(data, "incident_id"), p_assigned_to: value(data, "assigned_to"), p_note: null
        });
        setDashboardFeedback("Incident affecté.", "ok");
        await refresh(); return;
      case "admin-resolve-incident":
        await rpc("admin_resolve_incident", {
          p_incident_id: value(data, "incident_id"), p_resolution: value(data, "resolution"), p_status: "resolved"
        });
        setDashboardFeedback("Incident résolu et historisé.", "ok");
        await refresh(); return;
      case "admin-handover":
        await rpc("admin_handover_fallback", { p_booking_id: value(data, "booking_id"), p_reason: value(data, "reason") });
        setDashboardFeedback("Remise validée par procédure de secours administrateur, explicitement auditée.", "warning");
        await refresh(); return;
      default:
        throw new Error("FORMULAIRE_INCONNU:" + name);
    }
  }

  function setButtonBusy(button, busy) {
    if (!button) return;
    if (busy) {
      button.dataset.wasDisabled = button.disabled ? "true" : "false";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    } else {
      if (button.dataset.wasDisabled !== "true") button.disabled = false;
      button.removeAttribute("aria-busy");
      delete button.dataset.wasDisabled;
    }
  }

  function safeFileName(name) {
    return String(name || "document").replace(/[^A-Za-z0-9._-]/g, "_").slice(-80);
  }

  function attachHandlers() {
    document.addEventListener("submit", async function (event) {
      const form = event.target.closest("form[data-form]");
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      setButtonBusy(button, true);
      try {
        await handleForm(form.dataset.form, form, new FormData(form));
      } catch (error) {
        const message = friendlyError(error);
        const inline = form.querySelector(".feedback");
        if (inline) { inline.hidden = false; inline.textContent = message; }
        else setDashboardFeedback(message, "error");
        setAuthStatus(message, "error");
      } finally {
        // Un formulaire à écriture unique (ex. demande de colis) reste verrouillé
        // après succès afin d'empêcher une seconde soumission par double clic.
        if (button && button.dataset.submitted !== "true") setButtonBusy(button, false);
        else if (button) button.removeAttribute("aria-busy");
      }
    });

    document.addEventListener("click", async function (event) {
      const trigger = event.target.closest(".trip-contact-trigger");
      if (trigger) {
        event.preventDefault();
        const trip = UI.getTrip(trigger.dataset.tripId);
        if (!trip) return;
        if (!state.session) { UI.openProfileView(); setAuthStatus("Connectez-vous pour déposer une demande.", "warning"); return; }
        if (!state.me || !state.me.email_verified) { UI.openProfileView(); setAuthStatus("Confirmez votre adresse e-mail avant de déposer une demande.", "warning"); return; }
        if (!state.me.profile || !state.me.profile.profile_completed_at) { UI.openProfileView(); setAuthStatus("Complétez votre profil avant de déposer une demande.", "warning"); return; }
        state.selectedTrip = trip;
        state.requestIdempotencyKey = crypto.randomUUID();
        const form = $("#contact-gp-form");
        form.reset();
        form.querySelector('button[type="submit"]').disabled = false;
        $("#contact-trip-summary").innerHTML = "<strong>" + esc(trip.origin) + " → " + esc(trip.destination) +
          "</strong><span>" + esc(trip.dateLabel) + " · " + esc(trip.priceLabel) + " · " + esc(trip.capacityLabel) + "</span>";
        const feedback = $("#contact-gp-feedback");
        feedback.hidden = true; feedback.textContent = "";
        UI.openModal("contact-gp-modal", trigger);
        return;
      }
      const button = event.target.closest("[data-action]");
      if (!button) return;
      event.preventDefault();
      setButtonBusy(button, true);
      try { await handleAction(button.dataset.action, button.dataset); }
      catch (error) { setDashboardFeedback(friendlyError(error), "error"); setAuthStatus(friendlyError(error), "error"); }
      finally { setButtonBusy(button, false); }
    });
  }

  async function boot() {
    homeLoginButtonRef = $("#home-login-button");
    homeProfileButtonRef = $("#home-profile-button");
    const ready = await waitForSupabase();
    const config = window.JOTCOLIS_CONFIG;
    if (!ready || !isValidPublicConfig(config)) {
      disableWhenBackendMissing("Le client Supabase ou la configuration publique est indisponible ou invalide. Aucun environnement de production n’est supposé et aucun parcours métier n’est simulé.");
      return;
    }
    const environment = resolveEnvironment(config);
    state.environment = environment.label + " (" + environment.mode + ")";
    state.environmentMode = environment.mode;
    state.client = window.supabase.createClient(config.url, config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    window.JOTCOLIS_SUPABASE = state.client;
    attachHandlers();

    state.client.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") {
        const reset = $("#reset-password-form");
        if (reset) reset.hidden = false;
        setAuthStatus("Vous pouvez définir un nouveau mot de passe.", "info");
      }
      void refresh();
    });
    if (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery")) {
      const reset = $("#reset-password-form");
      if (reset) reset.hidden = false;
    }
    await refresh();
  }

  boot();
})();
