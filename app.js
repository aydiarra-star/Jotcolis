const DEMO_STORAGE_KEY = "jotcolis-demo-trips-v1";
const form = document.querySelector("#search-form");
const feedback = document.querySelector("#search-feedback");
const tripForm = document.querySelector("#trip-form");
const tripFeedback = document.querySelector("#trip-feedback");
const tripResults = document.querySelector("#trip-results");
const starterTrips = [
  { id: "demo-1", origin: "Paris", destination: "Dakar", date: "2026-12-12", capacity: 8 },
  { id: "demo-2", origin: "Dakar", destination: "Paris", date: "2026-12-20", capacity: 5 },
  { id: "demo-3", origin: "Lyon", destination: "Dakar", date: "2027-01-08", capacity: 4 }
];
function readTrips() {
  try { const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]"); return starterTrips.concat(Array.isArray(saved) ? saved : []); }
  catch { return starterTrips; }
}
function norm(value) { return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr"); }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, function (ch) {
    return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch];
  });
}
function renderTrips(trips) {
  if (!tripResults) return;
  const list = trips || readTrips();
  if (!list.length) { tripResults.innerHTML = '<div class="trip-empty">Aucun exemple ne correspond. Essayez une autre recherche ou ajoutez un trajet fictif.</div>'; return; }
  tripResults.innerHTML = list.map(function (trip) {
    const date = trip.date ? new Date(trip.date + "T12:00:00").toLocaleDateString("fr-FR", {day:"numeric",month:"long",year:"numeric"}) : "Date non précisée";
    const isParisDakar = norm(trip.origin) === "paris" && norm(trip.destination) === "dakar";
    const flight = isParisDakar ? '<div class="trip-flight" aria-label="Animation de la liaison Paris–Dakar"><span class="flight-city">Paris</span><span class="flight-track"><svg class="route-plane" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 14.5 21l-3.7-7.8L3 9.5 21 3Z" fill="currentColor"/><path d="m10.8 13.2 4.7-4.7" stroke="#fff" stroke-width="1.2" stroke-linecap="round"/></svg></span><span class="flight-city">Dakar</span></div>' : "";
    return '<article class="trip-card' + (isParisDakar ? ' trip-card-flight' : '') + '"><span class="trip-demo-tag">Exemple fictif</span><h3>' + escapeHtml(trip.origin) + ' <span aria-hidden="true">→</span> ' + escapeHtml(trip.destination) + '</h3>' + flight + '<p class="trip-route">' + date + '</p><p class="trip-meta">Capacité illustrative : ' + Number(trip.capacity) + ' kg</p><p class="trip-meta">Aucun GP réel · Aucune réservation possible</p></article>';
  }).join("");
}
if (form && feedback) {
  form.addEventListener("submit", function (event) {
    event.preventDefault();
    const origin = document.querySelector("#origin").value.trim();
    const destination = document.querySelector("#destination").value.trim();
    const date = document.querySelector("#travel-date").value;
    const weight = document.querySelector("#weight").value;
    const matches = readTrips().filter(function (trip) {
      return norm(trip.origin) === norm(origin) && norm(trip.destination) === norm(destination) && (!date || !trip.date || trip.date >= date) && (weight === "any" || Number(trip.capacity) >= Number(weight));
    });
    feedback.hidden = false;
    feedback.textContent = "Démo locale : " + matches.length + " exemple(s) fictif(s). Aucun trajet réel consulté et aucune réservation créée.";
    renderTrips(matches);
    document.querySelector("#resultats")?.scrollIntoView({behavior:"smooth",block:"start"});
  });
}
if (tripForm && tripFeedback) {
  tripForm.addEventListener("submit", function (event) {
    event.preventDefault();
    const origin = document.querySelector("#trip-origin").value.trim();
    const destination = document.querySelector("#trip-destination").value.trim();
    const date = document.querySelector("#trip-date").value;
    const capacity = Number(document.querySelector("#trip-capacity").value);
    if (!origin || !destination || !date || !Number.isFinite(capacity) || capacity < 1 || capacity > 100) {
      tripFeedback.textContent = "Vérifiez les villes, la date et une capacité comprise entre 1 et 100 kg."; return;
    }
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || "[]"); if (!Array.isArray(saved)) saved = []; }
    catch { saved = []; }
    saved.push({id:"local-" + Date.now(),origin:origin,destination:destination,date:date,capacity:capacity});
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(saved));
      tripFeedback.textContent = "Trajet fictif ajouté dans ce navigateur seulement. Aucun autre utilisateur ne le voit.";
      tripForm.reset(); document.querySelector("#trip-capacity").value = "5"; renderTrips();
    } catch { tripFeedback.textContent = "Enregistrement local indisponible. Aucun trajet n’a été publié en ligne."; }
  });
}
renderTrips();


// Navigation mobile : conserve un état actif lisible après chaque sélection.
document.querySelectorAll(".mobile-bottom-nav a").forEach(function (link) {
  link.addEventListener("click", function () {
    document.querySelectorAll(".mobile-bottom-nav a").forEach(function (item) {
      item.removeAttribute("aria-current");
    });
    link.setAttribute("aria-current", "page");
  });
});


// Raccourcis des corridors internationaux : ils remplissent la recherche, sans inventer de disponibilités.
document.querySelectorAll(".corridor-card").forEach(function (button) {
  button.addEventListener("click", function () {
    const origin = document.querySelector("#origin");
    const destination = document.querySelector("#destination");
    if (!origin || !destination) return;
    origin.value = button.dataset.origin || "";
    destination.value = button.dataset.destination || "Dakar";
    document.querySelector("#search-form")?.scrollIntoView({behavior:"smooth",block:"center"});
    origin.focus({preventScroll:true});
    const feedback = document.querySelector("#search-feedback");
    if (feedback) {
      feedback.hidden = false;
      feedback.textContent = "Itinéraire prérempli en mode démo. Les corridors internationaux sont en préparation ; aucune disponibilité réelle n’est consultée.";
    }
  });
});


// Authentification réelle Supabase. Aucun secret privilégié n'est chargé dans le navigateur.
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
    status.textContent = "Le service de compte n’est pas disponible dans ce chargement. La démonstration reste accessible.";
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
    if (signedIn && emailLabel) emailLabel.textContent = "Connecté : " + session.user.email;
    if (signedIn) setAuthStatus("Connexion sécurisée active. Votre profil est associé à ce compte.");
  }

  signupForm.addEventListener("submit", async function(event) {
    event.preventDefault();
    const button = signupForm.querySelector("button[type=submit]");
    const displayName = document.querySelector("#signup-name").value.trim();
    const email = document.querySelector("#signup-email").value.trim();
    const password = document.querySelector("#signup-password").value;
    if (!displayName || password.length < 8) {
      setAuthStatus("Saisissez un nom et un mot de passe d’au moins huit caractères.");
      return;
    }
    button.disabled = true;
    setAuthStatus("Création du compte en cours…");
    try {
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      if (data.session) {
        renderSession(data.session);
      } else {
        setAuthStatus("Demande d’inscription envoyée. Consultez votre e-mail pour confirmer le compte avant de vous connecter.");
      }
    } catch (error) {
      setAuthStatus(error && error.message ? "Inscription impossible : " + error.message : "Inscription impossible. Réessayez plus tard.");
    } finally { button.disabled = false; }
  });

  signinForm.addEventListener("submit", async function(event) {
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

  if (signoutButton) signoutButton.addEventListener("click", async function() {
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

  client.auth.onAuthStateChange(function(_event, session) { renderSession(session); });
  client.auth.getSession().then(function(result) {
    if (result.error) throw result.error;
    renderSession(result.data.session);
    if (!result.data.session) setAuthStatus("Service de compte connecté. Vous pouvez créer un compte ou vous connecter.");
  }).catch(function() {
    setAuthStatus("Impossible de vérifier la session. Vérifiez votre connexion puis rechargez la page.");
  });
})();


// Recherche connectée : seules les offres publiées sur un corridor actif sont affichées.
// Si le backend est configuré mais indisponible, ne jamais présenter les exemples fictifs comme réels.
(function initPublishedTripSearch() {
  const searchForm = document.querySelector("#search-form");
  const feedback = document.querySelector("#search-feedback");
  const results = document.querySelector("#trip-results");
  if (!searchForm || !feedback || !results) return;

  function renderPublishedTrips(trips) {
    if (!trips.length) {
      results.innerHTML = '<div class="trip-empty">Aucun trajet réel publié ne correspond à cette recherche. Les corridors restent fermés tant que leur validation opérationnelle n’est pas terminée.</div>';
      return;
    }
    results.innerHTML = trips.map(function (trip) {
      const date = trip.departure_at ? new Date(trip.departure_at).toLocaleDateString("fr-FR", {day:"numeric",month:"long",year:"numeric"}) : "Date à confirmer";
      const capacity = Number(trip.capacity_remaining_kg);
      const price = trip.price_per_kg == null ? "Prix à convenir" : Number(trip.price_per_kg).toLocaleString("fr-FR", {maximumFractionDigits:2}) + " " + escapeHtml(String(trip.currency || "EUR")) + "/kg";
      return '<article class="trip-card"><span class="trip-demo-tag">Trajet publié</span><h3>' + escapeHtml(trip.origin_city) + ' <span aria-hidden="true">→</span> ' + escapeHtml(trip.destination_city) + '</h3><p class="trip-route">' + escapeHtml(date) + '</p><p class="trip-meta">Capacité disponible : ' + (Number.isFinite(capacity) ? capacity.toLocaleString("fr-FR") : "à confirmer") + ' kg</p><p class="trip-meta">' + price + '</p>' + (trip.conditions ? '<p class="trip-meta">' + escapeHtml(trip.conditions) + '</p>' : '') + '<p class="trip-meta">Offre réelle publiée · Réservation non activée</p></article>';
    }).join("");
  }

  searchForm.addEventListener("submit", async function (event) {
    const client = window.JOTCOLIS_SUPABASE;
    if (!client) return; // Le gestionnaire de démonstration existant prend le relais.
    event.preventDefault();
    event.stopImmediatePropagation();
    const origin = document.querySelector("#origin").value.trim();
    const destination = document.querySelector("#destination").value.trim();
    const date = document.querySelector("#travel-date").value;
    const weight = document.querySelector("#weight").value;
    const button = searchForm.querySelector('button[type="submit"]');
    button.disabled = true;
    feedback.hidden = false;
    feedback.textContent = "Recherche des trajets réellement publiés…";
    try {
      let query = client.from("trips")
        .select("id, origin_city, destination_city, departure_at, capacity_remaining_kg, price_per_kg, currency, conditions, corridors!inner(is_active)")
        .eq("status", "published")
        .eq("corridors.is_active", true)
        .ilike("origin_city", "%" + origin + "%")
        .ilike("destination_city", "%" + destination + "%")
        .gte("departure_at", new Date().toISOString())
        .order("departure_at", {ascending:true})
        .limit(30);
      if (date) query = query.gte("departure_at", new Date(date + "T00:00:00").toISOString());
      if (weight !== "any") query = query.gte("capacity_remaining_kg", Number(weight));
      const {data, error} = await query;
      if (error) throw error;
      const trips = Array.isArray(data) ? data : [];
      feedback.textContent = trips.length + " trajet(s) réel(s) publié(s) trouvé(s). Aucune réservation n’a été créée.";
      renderPublishedTrips(trips);
    } catch (error) {
      feedback.textContent = "Recherche indisponible : impossible de vérifier les trajets réels. Aucun exemple fictif n’est présenté comme une offre réelle.";
      results.innerHTML = '<div class="trip-empty">Le service de recherche est momentanément indisponible. Réessayez plus tard.</div>';
    } finally {
      button.disabled = false;
    }
    document.querySelector("#resultats")?.scrollIntoView({behavior:"smooth",block:"start"});
  }, true);
})();
