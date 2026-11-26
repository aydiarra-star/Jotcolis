// Configuration PUBLIQUE du client navigateur.
// Ne jamais ajouter de clé service_role, de secret de prestataire ou de token ici.
// L'environnement n'est JAMAIS déduit comme « production » par défaut : un hôte
// de prévisualisation reste « preview », même si un flag explicite dit le contraire.

(function () {
  "use strict";

  const ENVIRONMENT_LABELS = Object.freeze({
    development: "Développement local",
    preview: "Prévisualisation / préproduction",
    production: "Production déclarée",
  });

  function normalizeHostnames(values) {
    if (!Array.isArray(values)) return Object.freeze([]);
    return Object.freeze(values
      .filter(function (value) { return typeof value === "string"; })
      .map(function (value) { return value.trim().toLowerCase(); })
      .filter(Boolean));
  }

  function detectEnvironment(options) {
    const input = options || {};
    const win = input.window || window;
    const host = String(input.hostname || (win.location && win.location.hostname) || "").trim().toLowerCase();
    const explicit = String(input.explicit || "").trim().toLowerCase();
    const productionHostnames = normalizeHostnames(input.productionHostnames);
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" ||
      host === "::1" || host.endsWith(".localhost") || host === "";
    const isPreviewHost = /(^|\.)(e2b\.app|onrender\.com|vercel\.app|netlify\.app|pages\.dev|github\.io)$/.test(host) ||
      /(^|[-_.])(preview|preprod|preproduction|staging|dev)([-_.]|$)/.test(host);
    const explicitProduction = explicit === "production" || explicit === "prod";
    const explicitDevelopment = explicit === "development" || explicit === "dev" || explicit === "local";
    const explicitPreview = explicit === "preview" || explicit === "previsualisation" ||
      explicit === "preproduction" || explicit === "staging";

    let mode = "preview";
    let reason = "hote_inconnu_ou_non_declare";
    if (explicitDevelopment || isLocal) {
      mode = "development";
      reason = isLocal ? "hote_local" : "flag_development";
    } else if (isPreviewHost) {
      // Priorité absolue : jamais de faux « production » sur une prévisualisation.
      mode = "preview";
      reason = "hote_preview";
    } else if (explicitProduction && productionHostnames.includes(host)) {
      mode = "production";
      reason = "flag_et_hote_production_autorises";
    } else if (explicitPreview) {
      mode = "preview";
      reason = "flag_preview";
    } else if (explicitProduction) {
      mode = "preview";
      reason = "production_refusee_sans_liste_blanche";
    }

    return Object.freeze({
      mode: mode,
      label: ENVIRONMENT_LABELS[mode],
      hostname: host,
      reason: reason,
      explicit: explicit || null,
      productionDeclared: explicitProduction,
    });
  }

  const productionHostnames = normalizeHostnames(window.JOTCOLIS_PRODUCTION_HOSTNAMES);
  const explicitEnvironment = String(
    window.JOTCOLIS_ENV ||
    new URLSearchParams(window.location && window.location.search || "").get("jotcolis_env") ||
    ""
  );

  const environment = detectEnvironment({
    window: window,
    hostname: window.location && window.location.hostname,
    explicit: explicitEnvironment,
    productionHostnames: productionHostnames,
  });

  window.JotColisEnvironment = Object.freeze({
    labels: ENVIRONMENT_LABELS,
    detectEnvironment: detectEnvironment,
  });

  window.JOTCOLIS_CONFIG = Object.freeze({
    url: "https://rzezmtahqrxiivdjfajo.supabase.co",
    publishableKey: "sb_publishable_BMOpIQbUEnrxYSE_QWhP3A_m_lX_qF-",
    environment: environment,
    productionHostnames: productionHostnames,
  });
})();
