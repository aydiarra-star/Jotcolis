# JotColis — contraintes définitives Supabase Free

Document de référence mis à jour le **26 novembre 2026**. Il concerne le projet officiel `rzezmtahqrxiivdjfajo` (`https://rzezmtahqrxiivdjfajo.supabase.co`, région Paris `eu-west-3`). Il ne remplace pas une vérification dans le dashboard : aucun connecteur Supabase ni accès propriétaire n'était disponible pendant l'audit.

## 1. Décision de périmètre

- **Supabase Free uniquement** : aucune branche payante, aucun upgrade Pro, aucun add-on facturé, aucun projet parallèle payant, aucun changement de facturation.
- Aucune dépendance externe facturée obligatoire : Auth, PostgreSQL, RLS, RPC, Storage privé, notifications `in_app`, frontend statique et tests locaux/CI suffisent aux parcours techniques essentiels.
- Aucune infrastructure supplémentaire : pas de file d'attente, de cron externe, de base annexe, de service d'observabilité payant ni de worker hébergé hors Supabase.
- Aucun prestataire e-mail ou WhatsApp n'est choisi, testé, payé ou activé. Les canaux externes restent bloqués tant que le propriétaire n'a pas autorisé un test réel et que le serveur n'a pas confirmé l'état `operationnel`.
- La sécurité n'est jamais réduite pour rester gratuit : RLS, moindres privilèges, `SECURITY DEFINER` avec `search_path = ''`, audit, claims avec bail et blocage des envois non confirmés restent obligatoires.

## 2. Quotas officiels Free

Sources officielles consultées : [About billing on Supabase](https://supabase.com/docs/guides/platform/billing-on-supabase) (mise à jour 17 septembre 2026), [How billing works](https://supabase.com/docs/guides/platform/org-based-billing), [Compute and Disk](https://supabase.com/docs/guides/platform/compute-and-disk) (mise à jour 25 novembre 2026), [Database and Disk Size](https://supabase.com/docs/guides/platform/database-size), [Manage Edge Function Invocations usage](https://supabase.com/docs/guides/platform/manage-your-usage/edge-function-invocations), [Manage Storage size usage](https://supabase.com/docs/guides/platform/manage-your-usage/storage-size), [Manage Realtime Peak Connections usage](https://supabase.com/docs/guides/platform/manage-your-usage/realtime-peak-connections), [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

| Ressource | Limite Free documentée | Conséquence JotColis |
| --- | --- | --- |
| Projets actifs | 2 par owner/administrator, tous organisations confondues ; projets paused non comptés | Ne pas créer de projet payant ni multiplier les environnements |
| Egress unifié | 5 Go par organisation | Surveiller DB, Storage, Auth, Edge Functions, Realtime et logs ; éviter les SELECT `*` et gros exports répétés |
| Taille de base | 500 Mo par projet | Surveiller tables, index, WAL et documents ; garder une marge |
| Disque | 2 Go fixe, sans autoscale ; lecture seule vers 95 % d'usage disque | Éviter imports massifs, WAL volumineux et builds d'index lourds ; si le disque se remplit, Postgres reste arrêté jusqu'à une décision propriétaire de upgrade |
| Stockage | 1 Go | Documents GP et pièces d'incident dans buckets privés ; transformation d'images indisponible en Free |
| Auth | 50 000 MAU ; 50 000 MAU tiers ; SSO mensuel indisponible | Suffisant pour validation contrôlée ; vérifier les rate limits Auth avant campagne |
| Edge Functions | 500 000 invocations ; 25 fonctions au plus | Worker non déployé ; aucun cron ni boucle infinie ; `secret-check` n'appelle aucun prestataire |
| Realtime | 2 millions de messages ; 200 connexions simultanées | Aucun parcours essentiel n'exige Realtime |
| Connexions | Nano : 60 connexions DB max, 200 clients pooler max, pool par défaut 15 | Le navigateur utilise la Data API/REST, pas de connexion Postgres directe ; les opérations serveur doivent utiliser le pooler partagé en transaction mode si nécessaire |
| Compute | Nano, CPU partagé, jusqu'à 0,5 Go RAM, 5 Mo/s de débit disque soutenu et 250 IOPS soutenus | Éviter les pics de charge, tester la concurrence en prévalidation, limiter les requêtes dashboard (100/200 lignes) |

Les quotas d'egress et plusieurs autres quotas sont agrégés au niveau de l'organisation. Les chiffres doivent être revérifiés dans le dashboard du projet officiel avant préproduction : plan réel, organisation, usage courant, Spend Cap et adresse e-mail propriétaire n'ont pas pu être contrôlés depuis cet environnement.

## 3. Pause après inactivité

Source officielle : [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing) (mise à jour 22 septembre 2026) et [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod).

Un projet Free peut être mis en pause après **7 jours de faible activité utilisateur dans la base**. Quelques requêtes utilisateur par jour sont généralement suffisantes pour éviter la pause. Supabase envoie un e-mail d'avertissement environ une semaine avant, puis un e-mail de confirmation après la pause. Le projet peut être restauré depuis Supabase Studio pendant **1 an**, avec ses données et configurations précédentes. Les projets payants ne sont pas soumis à cette pause ; aucune upgrade n'est autorisée dans cette mission.

Conséquences : le plan Free n'offre pas une garantie de disponibilité commerciale. Il faut une adresse e-mail propriétaire surveillée, une procédure de restauration, une supervision minimale de l'activité/usage et une vérification après chaque pause. Aucune upgrade ni aucun add-on ne doit être activé sans validation explicite du propriétaire.

## 4. Sauvegardes et restauration

Sources officielles : [Database Backups](https://supabase.com/docs/guides/platform/backups) (mise à jour 12 novembre 2026), [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod), [Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Upgrading](https://supabase.com/docs/guides/platform/upgrading).

- Supabase documente des sauvegardes quotidiennes automatiques pour Pro, Team et Enterprise. Pour les projets Free, la documentation recommande d'exporter régulièrement les données avec la commande Supabase CLI `supabase db dump` et de conserver des copies hors site.
- La Production Checklist précise que **les sauvegardes de base ne sont pas téléchargeables pour les projets Free**. Le snapshot utilisé pour restaurer un projet paused n'est pas une sauvegarde quotidienne exploitable par le propriétaire pendant le fonctionnement normal.
- Les sauvegardes de base n'incluent **pas les objets Storage** : une restauration DB ne rend pas des fichiers supprimés après la sauvegarde.
- PITR, read replicas, log drains, IPv4 dédié, compute supérieur et support avancé sont des add-ons ou fonctionnalités payantes : ils ne sont pas activés ici.
- La fenêtre de restauration d'un projet paused est d'un an ; elle existe notamment parce que les sauvegardes ne sont conservées que pour une durée limitée et que les versions plateforme peuvent ne plus être rétrocompatibles.
- La suppression d'un projet est irréversible : base, données, backups, Storage, Auth, Edge Functions et configurations sont supprimés définitivement.

### Procédure de restauration sans dépense supplémentaire

1. **Avant toute migration distante**, le propriétaire exporte un dump logique avec Supabase CLI `supabase db dump` (rôles, schéma, données), puis stocke ce dump hors Supabase dans un emplacement qu'il contrôle, sans secret dans Git.
2. Exporter séparément la liste des buckets et, si nécessaire, les objets Storage ; les bases de données ne contiennent que leurs métadonnées.
3. Consigner la version Git, la liste des migrations appliquées, les noms des variables serveur, les buckets privés, les paramètres Auth et les éventuels secrets sans jamais enregistrer leurs valeurs dans le dépôt.
4. Tester la restauration sur un environnement de validation isolé, idéalement un projet Free existant sans dépasser la limite de deux projets actifs, ou une base locale PostgreSQL/PGlite pour vérifier la structure. Ne jamais écraser des données réelles sans autorisation écrite du propriétaire.
5. En cas de pause : Dashboard Supabase → organisation → projet paused → **Resume project** → confirmer, dans la fenêtre d'un an ; vérifier ensuite données, configurations, RLS, buckets et Auth.
6. En cas de restauration logique : restaurer le dump dans un projet de validation, réappliquer les noms de variables serveur et les buckets privés, puis exécuter les contrôles RLS/grants/RPC et les scénarios fonctionnels avec comptes fictifs.
7. Vérifier les codes d'erreur et l'absence de données personnelles réelles dans les exports de test ; documenter le RPO/RTO réellement obtenu. Sans PITR, une restauration peut perdre les écritures postérieures au dernier dump.
8. Si le disque est plein, si le projet a été supprimé ou si la fenêtre d'un an est dépassée, la récupération peut exiger une décision propriétaire hors périmètre Free ; aucune action payante n'est effectuée par ce chantier.

## 5. Auth, Storage, Edge Functions et consommation

- **Auth** : 50 000 MAU et 50 000 MAU tiers ; SSO indisponible. La Production Checklist indique une limite par défaut de 2 e-mails Auth par heure sans SMTP personnalisé depuis septembre 2024, et 30 nouveaux utilisateurs/heure avec SMTP personnalisé. Un SMTP externe est une décision propriétaire ; aucun prestataire payant n'est requis pour les parcours internes.
- **Storage** : 1 Go, buckets `gp-documents` et `incident-evidence` privés, RLS sur `storage.objects`, chemins préfixés par `auth.uid()` pour les documents GP. Aucune transformation d'image, aucun stockage de secret, aucune donnée personnelle réelle dans les tests.
- **Edge Functions** : 500 000 invocations et 25 fonctions. `supabase/functions/notification-worker/index.ts` est non déployé ; `deno-scenarios.ts` tourne localement sans `--allow-net`. Le mode `secret-check` ne fait aucun appel prestataire. Aucun cron payant, aucune file externe, aucun test d'envoi réel.
- **Realtime** : non requis par les parcours essentiels. Surveiller malgré tout les 2 millions de messages et 200 connexions si le propriétaire active Realtime plus tard.
- **Data API** : le frontend appelle uniquement l'URL publique et la clé publishable, via Supabase JS et RPC/RLS. Aucun `service_role` navigateur, aucune connexion Postgres directe depuis le client.
- **Consommation** : limiter les champs sélectionnés, paginer/limiter les tableaux de bord, éviter les exports massifs, ne pas multiplier les workers, garder les payloads de notification whitelistés, ne pas journaliser de réponses prestataire ni de données personnelles.

## 6. Ce qui reste gratuit dans l'architecture

- Frontend statique : fichiers HTML/CSS/JS servis par l'hébergement officiel existant, sans nouveau service.
- Supabase : Auth, PostgreSQL, RLS, RPC, Storage privé, vues contrôlées et, plus tard si le propriétaire l'autorise, une Edge Function dans le quota Free.
- Notifications internes `in_app` : écriture dans `notification_outbox`, lecture via `my_notifications`, aucun prestataire externe.
- Worker : code et tests locaux dans le dépôt, non déployé ; `secret-check` sans appel prestataire ni coût.
- Tests : `npm ci`, PGlite, jsdom, Deno local et GitHub Actions, sans base Supabase payante.

## 7. Risques à ne pas masquer

- Pause après inactivité, egress, taille de base, disque fixe, WAL, stockage de documents GP, invocations Edge et connexions Nano doivent être surveillés.
- Sauvegardes automatiques avancées, PITR, réplicas, compute supérieur, IP dédiée et support avancé sont absents du périmètre Free ; leur absence doit être acceptée explicitement.
- Le plan Free n'est pas une garantie de disponibilité commerciale. Les validations juridiques FR/SN, CGU/RGPD, douanes, compagnies aériennes, assurances et modèle économique ne sont pas validées par la gratuité du plan.
- Aucune confirmation d'envoi externe, aucune concurrence réseau multi-clients, aucun comportement Storage/Auth/Edge distant, aucune restauration réelle et aucune compatibilité PostgreSQL/Supabase distante ne peut être déduite des tests locaux.
- Le plan réel, l'usage, le Spend Cap, l'état de pause et les sauvegardes du projet officiel restent non vérifiés sans accès propriétaire.

## 8. À vérifier sur le projet réel avant préproduction

1. Plan réel, organisation, région, usage, Spend Cap, adresse e-mail propriétaire et état de pause.
2. Historique des migrations distantes, schéma existant, données existantes et dump restaurable testé.
3. Application contrôlée des quatre migrations corrigées sur un environnement de validation, sans écrasement de données.
4. RLS, grants, policies, Storage buckets privés, Auth settings, premier administrateur, edge secrets et absence de `service_role` côté navigateur.
5. Déploiement éventuel de l'Edge Function et secrets serveur uniquement après autorisation.
6. Test d'envoi réel avec prestataire officiel, compte fictif, confirmation 2xx + identifiant de message, puis activation serveur explicite.
7. Supervision de l'activité pour limiter le risque de pause, procédure de restauration testée et registre des accès administrateurs.
