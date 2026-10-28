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
