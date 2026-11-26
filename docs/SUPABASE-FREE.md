# JotColis — contraintes et risques de la formule Supabase FREE

Ce document décrit les limites à respecter pour une validation sur le projet officiel `rzezmtahqrxiivdjfajo` (`https://rzezmtahqrxiivdjfajo.supabase.co`, Paris `eu-west-3`). Il ne remplace pas une vérification dans le dashboard : aucun connecteur Supabase, aucun accès propriétaire et aucune lecture des réglages distants n'était disponible pendant cet audit.

## Décision de périmètre

- Formule **FREE exclusivement** : aucune branche payante, aucun upgrade Pro, aucun add-on facturé, aucun projet parallèle payant.
- Aucune dépendance externe facturée obligatoire : les parcours internes fonctionnent avec Supabase Auth, PostgreSQL, RLS, notifications `in_app` et le frontend statique.
- Aucune infrastructure supplémentaire payante : pas de file d'attente, de cron externe, de base annexe, de service d'observabilité ou de worker hébergé hors Supabase.
- Aucun prestataire e-mail ou WhatsApp n'est activé, testé ou payé. Un canal externe ne devient `opérationnel` qu'après déclaration, secrets serveur, test réel confirmé et activation `service_role` explicite.
- La sécurité n'est jamais réduite pour rester gratuit : RLS, moindres privilèges, `SECURITY DEFINER` avec `search_path = ''`, audit et blocage des envois non confirmés restent obligatoires.

## Quotas officiels FREE consultés le 26 novembre 2026

La documentation officielle « About billing on Supabase » indique pour le plan Free : 2 projets actifs gratuits par organization owner/administrator, 5 Go d'egress par organisation, 500 Mo de base par projet, 50 000 MAU, 50 000 MAU tiers, 1 Go de stockage, 500 000 invocations Edge Functions, 2 millions de messages Realtime et 200 connexions Realtime simultanées. Le SSO mensuel et les transformations d'images ne sont pas disponibles en Free. Le quota d'egress et certains quotas sont agrégés au niveau de l'organisation, pas seulement du projet. Source : https://supabase.com/docs/guides/platform/billing-on-supabase (mise à jour documentation : 17 septembre 2026).

La documentation officielle « Manage Compute usage » précise que l'instance Nano du plan Free est à 0 USD et que les ressources de calcul du plan Free peuvent évoluer. Source : https://supabase.com/docs/guides/platform/manage-your-usage/compute.

Ces chiffres doivent être revérifiés dans le dashboard du projet officiel avant préproduction : le plan réel, l'organisation, l'usage courant, les limites de facturation et le Spend Cap n'ont pas pu être contrôlés depuis cet environnement.

## Risque de pause du projet

La documentation officielle « Project Pausing » indique que Supabase peut mettre en pause un projet Free après **7 jours de faible activité** ; quelques requêtes utilisateur vers la base chaque jour sont généralement suffisantes pour éviter la pause. Un e-mail d'avertissement est envoyé environ une semaine avant, puis un e-mail de confirmation après la pause. Le projet peut être restauré depuis le dashboard pendant une fenêtre d'un an, avec ses données et configurations. Les projets payants ne sont pas soumis à cette pause automatique. Sources : https://supabase.com/docs/guides/platform/free-project-pausing et https://supabase.com/docs/guides/platform/going-into-prod.

Conséquence pour JotColis : un projet FREE peut être indisponible même si le code est correct. Il faut une adresse e-mail propriétaire surveillée, une procédure de restauration, une supervision minimale de l'activité/usage et une vérification après chaque pause. Un lancement commercial ne peut pas s'appuyer uniquement sur cette disponibilité. Aucune upgrade payant n'est autorisé sans validation explicite du propriétaire.

## Ce qui reste gratuit dans l'architecture

- Frontend statique : fichiers HTML/CSS/JS servis par l'hébergement officiel existant, sans nouveau service.
- Supabase : Auth, PostgreSQL, RLS, RPC, Storage privé et, si nécessaire plus tard, une Edge Function incluse dans le quota FREE.
- Notifications internes `in_app` : écriture dans `notification_outbox`, visible via la vue contrôlée `my_notifications`; aucun prestataire externe nécessaire.
- Worker de notifications : code présent dans le dépôt, non déployé ; le mode `secret-check` n'appelle aucun prestataire et ne crée aucun coût.
- Tests : `npm ci`, PGlite et jsdom s'exécutent localement ou dans GitHub Actions, sans base Supabase payante.

## Risques à ne pas masquer

- La pause après inactivité, les quotas d'egress, la taille de base, le stockage de pièces GP et les invocations Edge doivent être surveillés.
- Les sauvegardes avancées, PITR, réplicas, compute supérieur, log drains et IP dédiée sont des add-ons ou fonctionnalités payantes : ils ne sont pas requis par le code mais leur absence doit être acceptée explicitement.
- Le plan FREE n'est pas une garantie de disponibilité commerciale. Les legal validations FR/SN, CGU/RGPD, douanes, compagnies aériennes et assurances ne sont pas validées par la gratuité du plan.
- Aucune confirmation d'envoi externe, aucune concurrence réseau multi-clients, aucun comportement Storage/Auth/Edge et aucune compatibilité PostgreSQL 17 distante ne peut être déduite des tests locaux.

## À vérifier sur le projet réel avant toute préproduction

1. Plan réel, organisation, région, usage, Spend Cap et adresse e-mail propriétaire.
2. Historique des migrations distantes, schéma existant, données existantes et sauvegarde restaurable.
3. Application contrôlée des quatre migrations corrigées sur un environnement de validation, sans écrasement de données.
4. RLS, grants, policies,Storage buckets privés, Auth settings et premier administrateur.
5. Déploiement éventuel de l'Edge Function et secrets côté serveur uniquement après autorisation.
6. Test d'envoi réel avec prestataire officiel, compte fictif, confirmation 2xx + identifiant de message, puis activation serveur explicite.
7. Supervision de l'activité pour limiter le risque de pause et procédure de restauration documentée.
