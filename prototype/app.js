const form = document.querySelector("#search-form");
const feedback = document.querySelector("#search-feedback");
const gpLink = document.querySelector("#gp-demo-link");

if (form && feedback) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const origin = document.querySelector("#origin").value.trim();
    const destination = document.querySelector("#destination").value.trim();

    if (!origin || !destination) {
      feedback.hidden = false;
      feedback.textContent = "Renseignez le départ et la destination pour tester le formulaire.";
      return;
    }

    feedback.hidden = false;
    feedback.textContent = `Démonstration uniquement : votre recherche « ${origin} → ${destination} » est prête à être reliée au futur moteur de recherche. Aucun trajet réel n’a été consulté et aucune réservation n’a été créée.`;
  });
}

if (gpLink) {
  gpLink.addEventListener("click", (event) => {
    event.preventDefault();
    window.alert("Prototype de conception : l’espace GP sera conçu dans une prochaine étape. Aucune publication de trajet n’est actuellement enregistrée.");
  });
}
