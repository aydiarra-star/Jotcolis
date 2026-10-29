# JotColis — Plan d’implémentation du backend MVP

Statut au 29 octobre 2026 : projet Supabase JotColis distinct créé et schéma métier de base installé. Le frontend statique n’est pas encore connecté à l’authentification ni aux données réelles. Aucune réservation, livraison ou transaction réelle n’est activée.

## Décision de séparation des environnements

Le projet Supabase **JotColis** est distinct de Dekk Food : référence `rzezmtahqrxiivdjfajo`, région Paris (`eu-west-3`), URL `https://rzezmtahqrxiivdjfajo.supabase.co`. Le tarif affiché lors de la création était de 0 $/mois ; les limites et éventuels usages additionnels doivent être surveillés. **Dekk Food n’a pas été modifié.** Ne jamais mettre une clé `service_role` dans le frontend ou le dépôt.

## Migration SQL préparée (non exécutée)

Un premier brouillon de schéma est versionné dans `supabase/migrations/202610280001_initial_schema_draft.sql`. Il comprend les tables de base, contraintes, index, RLS et permissions initiales. Il n’a été ni appliqué ni validé sur un projet Supabase : il faut le relire et le tester dans un projet JotColis séparé avant toute exécution. Les réservations et changements de capacité restent volontairement sans écriture directe côté client ; ils devront être implémentés via des fonctions serveur transactionnelles.

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
