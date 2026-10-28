# JotColis

**Votre colis voyage avec confiance.** *(signature de travail à valider)*

JotColis est un projet de plateforme mobile-first mettant en relation expéditeurs, voyageurs transporteurs (GP) et destinataires. L’objectif est de faciliter la recherche de trajets, d’améliorer la traçabilité et d’organiser la gestion des incidents.

> **État : prototype frontend exécutable en cours.** Le point d’entrée racine est une prévisualisation statique interactive ; la recherche reste une démonstration et aucune réservation, authentification, base de données, géolocalisation ou paiement réel n’est activé. Aucune intégration ou validation juridique ne doit être annoncée comme réalisée sans preuve.

## Principes
- Confiance vérifiable : identité, voyage et fiabilité sont des statuts distincts.
- Suivi honnête : événements déclarés, estimations et GPS consenti ne sont jamais confondus.
- Transparence : prix total, frais et conditions affichés avant confirmation.
- Traçabilité : passeport de colis et historique horodaté.
- Confidentialité : minimisation des données et permissions par rôle.
- International progressif : chaque corridor est activé après validation.
- Paiements et remboursements non simulés comme réels.

## MVP envisagé
1. Comptes et rôles.
2. Publication et recherche de trajets/capacités.
3. Demandes de colis sans trajet correspondant.
4. Réservation, acceptation/refus et contrôle de capacité.
5. Prix transparent et prestataire de paiement adapté.
6. Passeport du colis et preuves de prise en charge/remise.
7. Notifications, annulations, incidents et réclamations.
8. Console d’administration et journal d’audit.
9. Règles de corridor et de catégories issues de sources vérifiées.

## Prévisualisation en ligne

La première prévisualisation statique est déployée sur Render : [jotcolis-preview.onrender.com](https://jotcolis-preview.onrender.com). Elle est liée à la branche `feature/fondations-jotcolis` et se redéploie automatiquement après les nouveaux commits de cette branche. Il s’agit d’une démonstration frontend, pas encore d’un service de livraison opérationnel.

## Lancer la prévisualisation en local

Prérequis : Node.js 20 ou supérieur. Aucune dépendance npm externe n’est nécessaire.

```bash
npm test
npm run build
```

Le site statique généré se trouve dans `dist/`. Un Blueprint Render est fourni dans `render.yaml` pour préparer un service de prévisualisation ; il doit encore être créé et validé dans le compte Render.

## Documentation
- [Prompt maître](docs/PROMPT-MAITRE.md)
- [Cahier des charges fonctionnel](docs/CAHIER-DES-CHARGES.md)
- [Architecture cible](docs/ARCHITECTURE.md)
- [Feuille de route](docs/ROADMAP.md)
- [Parcours UX](docs/UX-PARCOURS.md)
- [Identité visuelle](docs/IDENTITE-VISUELLE.md)
- [Prototype visuel (HTML)](prototype/index.html)

## Lancement envisagé
Le corridor France–Sénégal est un pilote possible, sous réserve des validations juridiques, douanières, transport, paiement et opérationnelles. La conception doit prévoir l’international sans laisser croire que tous les corridors sont ouverts.

## Contribution
Travailler dans une branche dédiée, ouvrir une pull request, préserver le travail existant, ajouter les tests pertinents et documenter les risques. Ne jamais commiter de secrets ou de données personnelles réelles.
