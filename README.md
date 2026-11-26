# JotColis

**Votre colis voyage avec confiance.** *(signature de travail à valider)*

JotColis est une plateforme mobile-first de mise en relation entre expéditeurs, voyageurs transporteurs (GP), destinataires et administrateurs. Ce dépôt officiel contient le frontend statique, les migrations Supabase et la documentation du chantier.

> **État réel : `NON PRÊT` pour un lancement commercial.** Le frontend ne contient plus de trajets, confirmations, codes ou suivis de démonstration. Les nouveaux parcours sont contrôlés par Supabase Auth, RLS et des fonctions PostgreSQL. Les migrations de ce dépôt ont été exécutées et testées dans un PostgreSQL local PGlite, mais **elles n'ont pas été appliquées à la base Supabase distante** : l'accès propriétaire et la vérification des services vivants manquent. Aucun paiement, transport réel, réservation commerciale, envoi e-mail ou message WhatsApp n'est activé. Le rapport détaillé est [docs/AUDIT-ET-CHANTIER.md](docs/AUDIT-ET-CHANTIER.md).

## Ce qui est en place dans le code

- Authentification Supabase : inscription, connexion, déconnexion, confirmation, réinitialisation, session, profil complet et compte inactif.
- Rôles serveur : `expéditeur`, `voyageur GP`, `destinataire`, `administrateur`, sans attribution d'administrateur par l'utilisateur.
- Vérification GP avec sept statuts, contrôles distincts, documents privés, historique et décision administrateur motivée.
- Trajets : brouillons, publication conditionnelle, recherche sur les offres réellement publiées, modification limitée et annulation contrôlée.
- Demandes et réservations : déclaration du contenu, acceptation/refus, capacité atomique, idempotence et libération de capacité.
- Passeport colis : référence générée serveur, événements chaînés et immuables, transitions déclarées, suivi public sans donnée personnelle.
- Code de remise temporaire : génération imprévisible, hachage, expiration, tentatives, vérification serveur et procédure de secours administrateur auditée.
- Notifications : table d'outbox, historique immuable, tentatives, statut bloqué explicite et worker Edge Function non déployé. Aucun envoi n'est prétendu réussi sans réponse d'un prestataire officiel.
- Administration : utilisateurs, dossiers GP, corridors, trajets, réservations, incidents, validations juridiques, drapeaux d'exploitation et journal d'audit.
- Blocage légal : validations documentées France/Sénégal, catégories de marchandises et corridors désactivés par défaut. Aucune conformité juridique réelle n'est inventée.

## Prévisualisation et ressources officielles

Le projet officiel est `aydiarra-star/Jotcolis`. Les ressources à utiliser sont :

- Render : `https://jotcolis-main-preview.onrender.com/#accueil`, service `srv-dbhq75gn74is73eog6sg`.
- Supabase : projet `rzezmtahqrxiivdjfajo`, URL `https://rzezmtahqrxiivdjfajo.supabase.co`, région Paris `eu-west-3`.

Ces services n'ont pas pu être vérifiés depuis ce chantier : aucun connecteur ni identifiant d'accès propriétaire n'était disponible et les endpoints étaient injoignables depuis le sandbox. `render.yaml` est un blueprint de dépôt, pas la preuve de la configuration du service officiel. Aucun déploiement, aucune migration distante et aucune modification Render/Supabase n'a été effectuée.

## Développement local

Prérequis : Node.js 20 ou supérieur.

```bash
npm ci
npm test
npm run build
```

`npm test` exécute 39 tests : assertions statiques, 12 scénarios d'intégration SQL dans PGlite et 8 scénarios navigateur jsdom avec un client Supabase simulé. Aucun test ne touche la base ou les utilisateurs réels. `npm run build` génère `dist/` avec le frontend, les styles, le globe, la couche plateforme et le rapport d'audit. `dist/` et `node_modules/` sont ignorés par Git.

## Configuration et secrets

`supabase-config.js` contient uniquement l'URL publique et la clé publishable du navigateur. Aucune clé `service_role`, aucun secret de prestataire et aucun token ne doivent être committés. Les noms de variables serveur attendus sont documentés dans `.env.example`. Le premier administrateur doit être créé par une opération privilégiée `bootstrap_first_admin`, jamais depuis le navigateur.

## Documentation

- [Audit, chantier et état réel](docs/AUDIT-ET-CHANTIER.md) — document de référence.
- [Prompt maître](docs/PROMPT-MAITRE.md), [cahier des charges](docs/CAHIER-DES-CHARGES.md), [architecture cible](docs/ARCHITECTURE.md), [plan backend et sécurité](docs/PLAN-BACKEND-MVP.md), [feuille de route](docs/ROADMAP.md), [parcours UX](docs/UX-PARCOURS.md), [identité visuelle](docs/IDENTITE-VISUELLE.md) — documents historiques de conception, à relire au regard de l'audit.
- [Migrations SQL](supabase/migrations/) — six migrations historiques conservées, quatre migrations additives du chantier. À rapprocher de l'historique Supabase distant avant toute application.
- [Prototype visuel historique](prototype/index.html).

## Contribution

Travailler dans une branche dédiée, préserver le travail et les données existants, ajouter des tests fonctionnels et documenter les risques. Ne jamais commiter de secrets ou de données personnelles réelles. Ne pas fusionner ni déployer en production sans validation explicite du propriétaire et sans les vérifications de préproduction listées dans le rapport d'audit.
