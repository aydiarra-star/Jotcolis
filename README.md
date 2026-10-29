# JotColis

**Votre colis voyage avec confiance.** *(signature de travail à valider)*

JotColis est un projet de plateforme mobile-first mettant en relation expéditeurs, voyageurs transporteurs (GP) et destinataires. L’objectif est de faciliter la recherche de trajets, d’améliorer la traçabilité et d’organiser la gestion des incidents.

> **État : prototype frontend et fondations de données en place.** La prévisualisation reste statique : recherche, trajets et passeport sont des démonstrations locales fictives. Un projet Supabase JotColis distinct a été créé et le schéma initial installé avec RLS activée, mais le frontend n’est pas encore connecté à l’authentification ni aux données réelles. Aucune réservation, géolocalisation ou transaction réelle n’est activée.

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

La prévisualisation interactive est déployée sur Render : [jotcolis-preview.onrender.com](https://jotcolis-preview.onrender.com). Elle est liée à la branche `feature/fondations-jotcolis`. Elle permet de filtrer des trajets fictifs et d’ajouter un trajet de démonstration stocké dans le navigateur local. Ces données ne sont pas partagées avec d’autres utilisateurs et ne constituent pas des disponibilités réelles. Il ne s’agit pas encore d’un service de livraison opérationnel.

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
- [Plan backend MVP et sécurité](docs/PLAN-BACKEND-MVP.md)
- [Référence SQL du schéma initial Supabase](supabase/migrations/202610280001_initial_schema_draft.sql) — à rapprocher de l’historique distant avant de la considérer comme migration canonique.
- [Feuille de route](docs/ROADMAP.md)
- [Parcours UX](docs/UX-PARCOURS.md)
- [Identité visuelle](docs/IDENTITE-VISUELLE.md)
- [Prototype visuel (HTML)](prototype/index.html)

## Lancement envisagé
Le corridor France–Sénégal est un pilote possible, sous réserve des validations juridiques, douanières, transport, paiement et opérationnelles. La conception doit prévoir l’international sans laisser croire que tous les corridors sont ouverts.

## Contribution
Travailler dans une branche dédiée, ouvrir une pull request, préserver le travail existant, ajouter les tests pertinents et documenter les risques. Ne jamais commiter de secrets ou de données personnelles réelles.


## Authentification du prototype

Le formulaire d’inscription et de connexion utilise Supabase Auth via une clé publishable destinée au navigateur. Les profils sont créés par le déclencheur de base de données existant. Aucun secret service-role n’est embarqué dans le frontend. La recherche de trajets et les réservations restent en mode démonstration jusqu’à la mise en place des flux serveur sécurisés.
