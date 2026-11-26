// Configuration PUBLIQUE du client navigateur.
// Ne jamais ajouter de clé service_role, de secret de prestataire ou de token ici.
window.JOTCOLIS_CONFIG = Object.freeze({
  url: "https://rzezmtahqrxiivdjfajo.supabase.co",
  publishableKey: "sb_publishable_BMOpIQbUEnrxYSE_QWhP3A_m_lX_qF-",
  environment: (() => {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "Développement local";
    if (host.includes("onrender.com")) return "Aperçu Render — environnement à vérifier";
    return "Hébergement public — environnement à vérifier";
  })(),
});
