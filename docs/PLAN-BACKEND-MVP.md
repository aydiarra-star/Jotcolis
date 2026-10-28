# JotColis — Plan d’implémentation du backend MVP

Statut : préparation technique, non connecté à une base de données. Ce document ne constitue pas une autorisation de créer un service payant ni d’activer des livraisons réelles.

## Décision de séparation des environnements

Le compte Supabase actuellement accessible ne présente pas de projet JotColis dédié. Le seul projet repéré est « Dekk Food », inactif et sans rapport avec JotColis. **Ne pas le réutiliser, le restaurer ou y modifier le schéma.** Créer un projet séparé seulement après vérification et acceptation explicite du coût affiché par Supabase. Les migrations seront versionnées dans ce dépôt avant leur application.

## Première tranche backend

### Identité et rôles
- Supabase Auth pour inscription, connexion, récupération et confirmation d’adresse.
- `profiles` : `id` égal à `auth.users.id`, nom d’affichage facultatif, téléphone privé, pays, statut du compte et dates.
- Les rôles opérationnels ne doivent pas être déduits de `user_metadata` modifiable par l’utilisateur. Les privilèges support/admin sont gérés par un mécanisme serveur contrôlé et audité.

### Données métier minimales
- `corridors` : origine, destination, statut d’activation, règles et références de validation.
- `trips` : GP propriétaire, origine/destination, départ/arrivée, capacité totale et restante, statut, devise et conditions.
- `parcel_requests` : expéditeur, corridor, description minimale, poids, dimensions facultatives, dates, statut et expiration.
- `bookings` : demande, trajet, expéditeur, prix/monnaie figés, statut et transitions datées.
- `passport_events` : réservation, type d’événement, horodatage UTC, auteur, provenance et visibilité.
- `incidents` : réservation, catégorie, statut, responsable, résolution et journal des décisions.
- `audit_logs` : opérations sensibles de support et d’administration, sans secrets ni données excessives.

### Sécurité requise avant ouverture
- RLS activée sur toutes les tables exposées.
- Lecture publique limitée aux champs des trajets explicitement publiables et aux corridors actifs.
- Le GP ne peut modifier que ses trajets non verrouillés par une réservation ; l’expéditeur ne voit que ses demandes/réservations ; le destinataire n’accède qu’aux informations de remise explicitement partagées.
- Les changements de capacité et les réservations doivent être transactionnels côté serveur pour empêcher la double réservation.
- Les événements de passeport ne sont pas supprimables par les utilisateurs ; une correction ajoute un nouvel événement.
- Aucun document d’identité ni preuve privée dans des buckets publics.
- Aucune clé service-role dans le frontend.
- Tests d’accès croisé (BOLA/IDOR), tests de capacité concurrente et revue Supabase Advisors avant déploiement.

## Ordre de réalisation

1. Créer et valider un projet Supabase JotColis distinct, après confirmation du coût.
2. Écrire la migration versionnée avec contraintes, index, RLS et politiques minimales.
3. Tester les politiques avec utilisateurs expéditeur/GP/destinataire distincts.
4. Connecter le frontend avec l’URL et la clé publishable par variables d’environnement.
5. Implémenter comptes et profils, puis publication/recherche de trajets.
6. Ajouter demandes et réservations transactionnelles.
7. Ajouter passeport et incidents.
8. Ajouter les intégrations externes uniquement après choix et validations.

## Hors périmètre de cette tranche
Paiement, séquestre, GPS en continu, vérification documentaire automatisée, notifications SMS, promesse de délai et activation du corridor France–Sénégal. Ces éléments nécessitent des partenaires, des règles, une analyse juridique et des tests supplémentaires.
