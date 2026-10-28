# JotColis — Architecture cible

## Statut
Architecture préliminaire. Aucune pile technique n’est définitive avant l’évaluation du dépôt, du budget, des compétences, des paiements et de l’hébergement.

## Principes
- Application web responsive/PWA, mobile-first et accessible.
- Monolithe modulaire au démarrage, sans microservices prématurés.
- Autorisations vérifiées côté serveur.
- Écritures transactionnelles pour capacité et réservation.
- Paiements délégués à un prestataire adapté.
- Preuves privées par défaut.
- Observabilité, sauvegardes et tests dès les premières versions.
- Secrets séparés du code.

## Blocs logiques
1. Interface web/PWA pour visiteurs, expéditeurs, GP et destinataires.
2. API et logique métier : comptes, trajets, réservations, passeport, litiges.
3. Base relationnelle : utilisateurs, trajets, demandes, réservations, événements, paiements et audit.
4. Stockage privé des preuves et documents avec liens temporaires.
5. Tâches asynchrones : notifications, expirations et rapprochements.
6. Prestataires externes : paiement, e-mail/SMS, vérification d’identité, géocodage si requis.
7. Console d’administration.
8. Observabilité : erreurs, métriques, alertes et intégrations.

## Domaines métier
Identité et accès ; profil GP ; corridors et admissibilité ; trajets et capacité ; demandes et réservations ; passeport et preuves ; paiements ; notifications ; incidents et avis ; administration et audit. Les domaines peuvent partager un déploiement mais doivent garder des responsabilités claires.

## Modèle de données conceptuel
| Entité | Responsabilité |
|---|---|
| User | Compte, préférences, statut |
| GPProfile | Profil public minimal, vérifications |
| Trip | Trajet, horaires, capacité, prix, statut |
| ParcelRequest | Demande et données minimales du colis |
| Booking | Demande liée au trajet, conditions et états |
| PassportEvent | Historique horodaté des événements |
| Evidence | Référence privée, droits et conservation |
| PaymentRecord | Statuts et références prestataire |
| IncidentCase | Dossier, preuves, décision et recours |
| Notification | Canal, état et déduplication |
| CorridorRule | Règle sourcée et datée |
| AuditLog | Actions administratives sensibles |
| Review | Avis éligible et contestation |
| Referral | Parrainage et récompense conditionnelle |

## Réservations concurrentes
Utiliser une transaction ou un verrouillage équivalent côté serveur pour vérifier puis réserver la capacité. Ne jamais se fier au navigateur. Les expirations doivent libérer la capacité une seule fois et être idempotentes.

## Passeport
Chaque événement comporte identifiant, réservation, type, date UTC, acteur, source, visibilité et preuve éventuelle. Les corrections ajoutent une entrée explicative. Ne pas dupliquer des données personnelles si une référence protégée suffit.

## Paiements
Secrets côté serveur ; webhooks authentifiés et dédupliqués ; statuts prestataire comme source de vérité ; rapprochement des opérations. Ne pas collecter les données de carte si un flux hébergé convient. Aucun portefeuille ou séquestre sans analyse réglementaire et partenaire autorisé.

## Sécurité
Contrôle d’accès par rôle et ressource ; validation serveur ; sessions sécurisées ; limitation de débit ; secrets par environnement ; logs sans données inutiles ; stockage privé ; sauvegardes restaurées en test ; dépendances suivies ; plan de réponse aux incidents.

## Environnements
Développement local ; staging avec données fictives ; production séparée ; migrations versionnées ; déploiement reproductible, vérifications de santé et retour arrière. Aucune donnée de production dans les tests.

## Décisions techniques à prendre
Comparer framework frontend/PWA, backend/API, base relationnelle et recherche géographique, stockage, paiement marketplace, notifications, hébergement, sauvegardes, observabilité et vérification d’identité. Documenter justification, coûts, contraintes, alternatives et date de révision.
