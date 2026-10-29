# JotColis — Feuille de route et critères de réception

## Phase 0 — Fondations du dépôt
- [x] Documenter la vision et le prompt maître.
- [x] Rédiger le cahier des charges fonctionnel préliminaire.
- [x] Décrire l’architecture cible sans imposer prématurément une pile.
- [x] Inspecter le dépôt et choisir une pile légère pour le prototype statique.
- [ ] Ajouter conventions, sécurité, tests et CI adaptés.

## Phase 1 — Squelette applicatif
- [x] Prototype responsive et identité visuelle cohérente.
- [x] Pages publiques et navigation.
- [x] Configuration publique Supabase séparée du code applicatif (clé publishable uniquement).\n- [ ] Séparer les paramètres par environnement et compléter les contrôles de qualité.
- [x] Tests de base et démarrage reproductible.

## Phase 2 — Flux cœur
- [x] Première tranche d’authentification e-mail/mot de passe via Supabase (confirmation e-mail et URL de redirection à valider en configuration).\n- [ ] Revue complète des permissions et tests d’accès croisé.
- [ ] Profils GP et trajets.
- [ ] Recherche et demandes de colis.
- [ ] Réservation et capacité transactionnelle.
- [ ] États et historique.

## Phase 3 — Confiance et opérations
- [ ] Passeport du colis.
- [ ] Preuves de prise en charge et remise.
- [ ] Notifications.
- [ ] Annulations, incidents et litiges.
- [ ] Console d’administration et audit.

## Phase 4 — Paiements
- [ ] Choix du prestataire adapté au modèle et aux pays.
- [ ] Validation contractuelle et opérationnelle.
- [ ] Intégration sandbox, webhooks sécurisés et rapprochement.
- [ ] Tests erreurs, doublons, remboursements et contestations.
- [ ] Production après validation formelle.

## Phase 5 — Pilote contrôlé
- [ ] Règles du corridor pilote sourcées et datées.
- [ ] Procédures support, sécurité et litiges.
- [ ] Tests de bout en bout et restauration.
- [ ] Groupe limité de GP et d’utilisateurs.
- [ ] Suivi des KPI, incidents et coûts.
- [ ] Décision explicite d’ouverture commerciale.

## Phase 6 — Croissance
- [ ] Alertes sur demandes compatibles.
- [ ] Outils GP avancés.
- [ ] Parrainage anti-fraude.
- [x] Préparer les corridors France, Espagne, Italie, États-Unis et Émirats arabes unis ↔ Sénégal (inactifs tant que les validations ne sont pas acquises).
- [ ] Activer chaque corridor après validation juridique, douanière et opérationnelle, puis étendre langues et devises.

## Critères de passage
Une phase passe à la suivante seulement si les tests prévus sont exécutés, aucun défaut critique ne reste ouvert, la documentation est mise à jour, les risques sont traités explicitement et les validations juridiques/opérationnelles nécessaires sont acquises.

## Format de tâche
Chaque tâche contient un identifiant, objectif utilisateur, critères d’acceptation, dépendances, risques, tests, responsable, statut et lien vers PR/commit.
