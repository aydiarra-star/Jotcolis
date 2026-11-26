# MISSION ARENA — JOTCOLIS : AUDIT, CORRECTIONS ET VALIDATION AVANT PRODUCTION

**Branche** : `arena/b65591cf-jotcolis` · **Base de branche** : `bda2c41b44c20a7920b84646594f08a374bac223` · **Date** : 26 novembre 2026.

Périmètre : audit et fiabilisation du chantier existant, sans nouvelle fonctionnalité commerciale, sans migration sur la base Supabase de production, sans déploiement Render, sans déploiement Edge Function, sans fusion vers `main`. Les ressources officielles prises en compte sont le dépôt GitHub `aydiarra-star/Jotcolis`, le projet Supabase `rzezmtahqrxiivdjfajo` et le service Render `jotcolis-main-preview` / `srv-dbhq75gn74is73eog6sg`. Aucun accès propriétaire à Supabase ou Render n'était disponible.

> Conclusion finale : **`NON PRÊT`**. Les corrections ci-dessous rendent le code techniquement prêt pour une session de validation contrôlée sur Supabase FREE, mais pas pour une préproduction déclarée fonctionnelle : l'intégration distante, les migrations réelles, les données, les providers, la concurrence réseau et les validations juridiques ne sont pas vérifiées.

> **Addendum de clôture du 26 novembre 2026** : une phase finale a ensuite corrigé la détection d'environnement (`development` / `preview` / `production`), rendu les quatre migrations réexécutables, ajouté des tests Deno locaux du worker sans réseau, migré les actions GitHub vers `v6`/`node24` et enrichi la documentation Supabase Free (sauvegardes, restauration, connexions et consommation). Le rapport de clôture fait foi : [AUDIT-FINAL.md](AUDIT-FINAL.md). Les chiffres de tests ci-dessous décrivent l'état de la phase 2 avant cette dernière passe.

---

## 1. Problèmes constatés

1. **Activation de notifications par un booléen administrateur** : `admin_set_provider_config` écrivait `email_provider_configured` / `whatsapp_provider_configured`, pouvait mettre `notifications_enabled = true` et appelait `reactivate_blocked_notifications`. Une déclaration manuelle était donc confondue avec une configuration serveur testée.
2. **États insuffisants** : aucun état distinct pour `non configuré`, `configuré`, `testé`, `opérationnel`, `en erreur`. Un simple « configured » ne prouvait ni la présence des secrets côté serveur ni une confirmation du prestataire.
3. **Faux succès possibles** : `record_notification_result` acceptait `sent` sans exiger simultanément un HTTP 2xx, un identifiant de message prestataire, un claim valide et un état de canal opérationnel. Le worker considérait un 2xx comme suffisant même sans identifiant.
4. **Double envoi et timeout ambigu** : un claim expiré pouvait rester bloqué en `claimed` ; une exception réseau était traitée comme `failed` avec retry automatique, alors que le prestataire avait pu accepter le message. Le worker envoyait aussi le `payload` brut au prestataire e-mail.
5. **Exposition directe de `platform_config`** : une policy `select all` et un `grant select ... to anon, authenticated` permettaient une lecture directe de la table, et `platform.js` la sélectionnait explicitement. Même sans secret stocké, c'était une surface inutile.
6. **Dépendance commerciale implicite** : `admin_set_platform_flag(commercial_open)` exigeait `notifications_enabled`, ce qui pouvait imposer un prestataire externe pour ouvrir les parcours réels.
7. **Doublon d'historique public** : `get_parcel_passport` faisait un `UNION ALL` entre `bookings` et `parcel_requests` sur le même `parcel_code`, puis joignait tous les événements : chaque événement public pouvait apparaître deux fois.
8. **Idempotence de migration fragile** : `list_trip_corridors` était `DROP` + `CREATE`, ce qui peut perdre des grants si la migration est rejouée isolément.
9. **Privilèges par défaut incomplets** : seuls les privilèges par défaut du rôle `postgres` étaient verrouillés ; sur Supabase le rôle exécutant peut différer.
10. **UI à clarifier** : le formulaire admin parlait de « prestataire configuré côté serveur » et exposait `notifications_enabled` comme drapeau ; les états serveur n'étaient pas visibles ; les actions serveur n'avaient pas d'indicateur `aria-busy`.
11. **FREE non documenté** : quotas, pause après inactivité, restauration et absence de garantie de disponibilité commerciale n'étaient pas centralisés.

---

## 2. Corrections apportées

- Séparation stricte : `admin_set_provider_config` n'écrit plus que la **déclaration administrative** ; retirer une déclaration peut désactiver, la déclarer n'active jamais. Les états serveur sont gérés uniquement par RPC `service_role`.
- Nouvelle table `notification_provider_states` avec cinq états contraints, présence de secrets sous forme booléenne, dates de contrôle/test/activation, codes d'erreur, sans valeur de secret ni identifiant de message exposé au client.
- Nouveaux RPC `service_role` : `report_provider_secret_check`, `report_provider_error`, `record_provider_test_result`, `mark_provider_operational`. `notifications_enabled`, `*_provider_configured` et `*_provider_state` sont désormais dérivés par `sync_notification_provider_state`.
- `admin_set_platform_flag` refuse explicitement `notifications_enabled` (`NOTIFICATION_ACTIVATION_SERVER_ONLY`) et n'exige plus de prestataire externe pour `commercial_open`.
- `claim_notifications` ne revendique que les canaux `operationnel`, utilise un bail de deux minutes, un `claim_token`, `claimed_by`, et bloque les claims expirés pour réconciliation manuelle.
- `record_notification_result` exige 2xx + identifiant prestataire + provider + claim non expiré + canal opérationnel pour `sent`. Les erreurs explicites non-2xx restent retryables de façon bornée ; les timeouts et confirmations manquantes deviennent `blocked`, jamais `sent`.
- Worker : mode `secret-check` sans appel prestataire ni coût, mode `deliver` avec `Idempotency-Key` e-mail, corps whitelisté sans `payload` brut, identifiant prestataire obligatoire, logs uniquement compteurs/codes, aucune valeur `Deno.env` ni contact journalisé.
- `get_parcel_passport` reconstruit un seul état courant et ne duplique plus les événements.
- Suppression de la lecture directe de `platform_config` côté frontend et du grant `anon`/`authenticated` ; ajout des états non sensibles dans `get_my_state` et `admin_overview`.
- UI : libellés « déclaration », tableau des états serveur, suppression du bouton `notifications_enabled`, messages sans fausse activation, `aria-busy` sur les soumissions et actions.
- `list_trip_corridors` passe en `CREATE OR REPLACE` ; verrouillage des privilèges par défaut du rôle courant en plus de `postgres`.
- Documentation FREE avec quotas officiels, pause à 7 jours, restauration 1 an, absence de branche payante et de service facturé obligatoire.

---

## 3. Fichiers modifiés

- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `docs/AUDIT-ET-CHANTIER.md`
- `docs/AUDIT-PHASE-2.md`
- `docs/SUPABASE-FREE.md`
- `package.json`
- `platform.js`
- `scripts/build.mjs`
- `supabase/functions/notification-worker/README.md`
- `supabase/functions/notification-worker/index.ts`
- `supabase/migrations/202611260001_platform_status_enums.sql`
- `supabase/migrations/202611260002_platform_tables.sql`
- `supabase/migrations/202611260003_platform_rpcs.sql`
- `supabase/migrations/202611260004_platform_admin_security.sql`
- `tests/app.test.mjs`
- `tests/backend-migration.test.mjs`
- `tests/frontend-flows.test.mjs`
- `tests/reliability-audit.test.mjs`
- `tests/sql-integration.test.mjs`

---

## 4. Migrations corrigées

| Migration | Contrôle / correction |
| --- | --- |
| `202611260001_platform_status_enums.sql` | Ajout d'une note explicite PostgreSQL 17/Supabase : `ALTER TYPE ... ADD VALUE IF NOT EXISTS`, valeur utilisable seulement après `COMMIT`, ordre 001 avant 002/003/004. Aucune suppression de valeur. |
| `202611260002_platform_tables.sql` | Ajout de `claim_expires_at`, `claimed_by`, index de bail, table `notification_provider_states` avec cinq états et seeds `non_configure`, RLS activée sans policy client, trigger `updated_at`, descriptions/valeurs dérivées de `platform_config`. |
| `202611260003_platform_rpcs.sql` | Helper interne `notification_channel_is_operational`, `CREATE OR REPLACE` pour `list_trip_corridors`, `get_my_state` enrichi d'états non sensibles, `enqueue_notification` bloque les canaux externes non opérationnels et les contacts absents, `get_parcel_passport` sans doublon. |
| `202611260004_platform_admin_security.sql` | Synchronisation dérivée, claim/record durcis, réactivation contrôlée, quatre RPC `service_role` de cycle de vie, déclaration admin sans activation, `commercial_open` sans dépendance payante, `admin_overview` en liste blanche, grants et privilèges par défaut corrigés. |

Les quatre migrations sont additives et non destructives : pas de `DROP TABLE`, pas de suppression de colonne, pas de modification de données utilisateur existantes. Elles n'ont **pas** été appliquées à la base Supabase distante.

---

## 5. Tests réussis / échoués

Les cinq commandes exactes ont été exécutées dans cet ordre après réinstallation propre, sur la branche de travail, sans accès aux services distants :

| Commande | Résultat vérifié |
| --- | --- |
| `npm ci` | 40 paquets ajoutés, 41 audités, 0 vulnérabilité ; avertissement npm `whatwg-encoding@3.1.1` déprécié, sans erreur. |
| `npm test` | **52 tests / 52 réussis, 0 échec**. |
| `npm run build` | `JotColis built in dist/ (frontend, plateforme Supabase, styles et globe inclus).` |
| `npm run test:sql` | **19 tests / 19 réussis, 0 échec** (12 scénarios d'intégration historiques + 7 scénarios Phase 2). |
| `npm run test:frontend` | **22 tests / 22 réussis, 0 échec** (11 assertions statiques + 11 parcours jsdom). |

`npm test` se décompose en 22 assertions statiques d'architecture, de migrations et de code métier, 19 scénarios PostgreSQL locaux PGlite, et 11 parcours jsdom avec client Supabase simulé.

Scénarios demandés couverts par les nouveaux tests : utilisateur non connecté ; utilisateur connecté sans rôle autorisé ; propriétaire d'une donnée ; gestionnaire/admin (le rôle enum courant n'a pas de valeur `manager`, l'administrateur serveur est testé comme rôle de gestion) ; transporteur GP ; deux utilisateurs et séparation de leurs demandes/réservations ; refus de réservation sans surréservation ; notification bloquée, échec explicite, confirmation prestataire, double tentative de marquage envoyé et claim expiré ; trajet non publié absent de la recherche ; historique public incomplet sans doublon ; états prestataires; `secret-check` sans appel prestataire. Les tests ont échoué pendant la mise au point puis ont été corrigés : ambiguïté `channel` dans `claim_notifications`, erreur attendue de rôle sur une demande déjà décidée, exposition de `platform_config` à `authenticated`, message de feedback écrasé par un rendu, et faux positif d'expression régulière sur un motif de détection de secret. Aucun échec ne subsiste dans la suite finale.


Séparation : PGlite/jsdom/static sont des preuves locales de syntaxe, de logique SQL, de RLS simulée, de flux frontend simulés et de non-régression. Ils ne prouvent ni PostgreSQL 17 distant, ni Supabase Auth/Storage/Edge réels, ni concurrence réseau multi-clients, ni prestation e-mail/WhatsApp, ni conformité juridique.

---

## 6. Résultat du build

`npm run build` a réussi : `JotColis built in dist/ (frontend, plateforme Supabase, styles et globe inclus).`

`dist/` contient les 12 fichiers construits : `index.html`, `styles.css`, `premium.css`, `experience.css`, `platform.css`, `app.js`, `platform.js`, `journey-globe.js`, `supabase-config.js`, `docs/AUDIT-ET-CHANTIER.md`, `docs/AUDIT-PHASE-2.md`, `docs/SUPABASE-FREE.md`. `dist/` et `node_modules/` sont ignorés par Git ; aucun artefact de build n'a été ajouté au dépôt.


---

## 7. Résultats GitHub Actions

Le workflow `.github/workflows/ci.yml` déclenche désormais, sur `pull_request` et `push` de toutes les branches : `npm ci`, `npm test`, `npm run test:sql`, `npm run test:frontend`, `npm run build`. Le job est `test-and-build` sur `ubuntu-latest` avec Node.js 20 et `permissions: contents: read`.

Vérification **avant corrections** : le dernier commit connu `1b944d5a0edca71f6b751553b3f41c98b0533a9c` a un run GitHub Actions `45844240959` `success` et un check-run `test-and-build` `success` ; toutes les étapes étaient réussies. Cette preuve ne vaut pas pour les corrections Phase 2.

Vérification **après corrections** via `gh run watch`, `gh run list`, `gh api .../check-runs` et `gh api .../actions/jobs/...` : le commit de corrections `1d592ee6a0b7df04b5cb307f432743fc2c88a112` (« Harden provider activation, notification claims and Phase 2 audit ») a le run push `45863540176` `success`, URL `https://github.com/aydiarra-star/Jotcolis/actions/runs/45863540176`, créé le 2026-11-26T16:57:55Z et terminé le 2026-11-26T16:58:26Z. Le check-run `140060443887` (`test-and-build`) est `success` et le job `140060443887` est `success`. Les 11 étapes observées sont toutes `success` : Set up job, Checkout, Set up Node.js, Install test dependencies, Tests complets, Tests SQL ciblés, Tests frontend ciblés, Build static preview, Post Set up Node.js, Post Checkout, Complete job.

Le runner a émis une annotation non bloquante : les actions `actions/checkout@v4` et `actions/setup-node@v4` ciblent Node.js 20, déprécié, et ont été forcées sur Node.js 24. Le job reste `success`. Aucun PR check-run n'a été observé ; cette vérification concerne les événements `push` de la branche Arena.

Le présent rapport est ensuite mis à jour par un commit de documentation distinct, dont le propre run GitHub Actions est vérifié séparément après push ; ce résultat est consigné dans la réponse finale de mission. Aucun succès CI n'est attribué à un SHA non interrogé.

---

## 8. Problèmes non résolus

- Aucun accès au projet Supabase officiel : plan FREE réel, schéma distant, historique des migrations, données, Auth, Storage, Advisor, sauvegardes et logs non vérifiés.
- Aucune migration appliquée sur la base Supabase de production ; aucune donnée distante modifiée, conformément à la consigne.
- Aucun prestataire e-mail/WhatsApp choisi, testé, payé ou autorisé ; aucun envoi réel confirmé.
- Edge Function non déployée, aucun cron, aucune supervision d'exécution, aucun test Deno/Supabase Edge réel.
- Render non vérifié : configuration du service, variables, commit servi, disponibilité et logs inconnus.
- Validations juridiques FR/SN, CGU/RGPD, douanes, compagnies aériennes, assurances et modèle commercial non validés par un professionnel.
- Premier administrateur distant, restauration de sauvegarde, procédure de pause FREE et vraie concurrence multi-clients non vérifiés.
- Une pause FREE après 7 jours de faible activité reste un risque d'indisponibilité ; aucune montée de gamme payante n'est autorisée sans validation explicite.

---

## 9. Opérations nécessitant le Supabase réel

1. Vérifier le plan, l'organisation, la région `eu-west-3`, les quotas, le Spend Cap, l'e-mail propriétaire et la procédure de restauration.
2. Faire une sauvegarde contrôlée, comparer l'historique des migrations distantes au dépôt, puis appliquer les quatre migrations corrigées sur un environnement de validation FREE sans écraser les données.
3. Vérifier en SQL : tables, colonnes, contraintes, FK, index, RLS, policies, `SECURITY DEFINER`, `search_path`, grants `anon` / `authenticated` / `service_role`, absence d'accès direct à `platform_config` et `notification_provider_states`.
4. Créer le premier administrateur via `bootstrap_first_admin` en opération privilégiée, jamais depuis le navigateur.
5. Tester Auth, profil, rôles, GP, trajets, demandes, capacité atomique, passeport, codes de remise, incidents, historique public et administration avec comptes fictifs.
6. Vérifier Storage privé, buckets, documents GP et pièces d'incident, puis l'absence de données personnelles dans les réponses publiques.
7. Exécuter, seulement après autorisation, `secret-check` avec secrets serveur, un test réel confirmé par le prestataire, puis `record_provider_test_result` et `mark_provider_operational`.
8. Déployer l'Edge Function uniquement en préproduction, vérifier `claim_notifications`, `record_notification_result`, `notification_outbox`, `notification_attempts`, `audit_logs` et journaux prestataire.
9. Vérifier la concurrence réseau réelle, les timeouts, la reprise après panne et l'absence de double envoi avec un prestataire sandbox.
10. Vérifier Render officiel : build, commit servi, variables publiques, absence de `service_role` côté navigateur et cohérence avec le dépôt.

---

## 10. Étapes restantes avant préproduction

1. Obtenir l'accès propriétaire Supabase/Render et l'autorisation explicite d'une session de validation sur le projet FREE.
2. Appliquer et contrôler les migrations sur un environnement de validation, sans production ni données réelles.
3. Compléter les validations juridiques FR/SN et les références documentaires ; ne rien inventer.
4. Créer le premier administrateur, configurer les corridors et la tarification avec pièces validées.
5. Tester tous les parcours avec deux utilisateurs fictifs, un GP, un admin et un utilisateur non autorisé, puis tracer les résultats.
6. Décider explicitement d'activer ou non un prestataire de notifications, après vérification contractuelle, RGPD et coûts ; sans décision, laisser les canaux externes bloqués.
7. Mettre en place supervision minimale, sauvegarde/restauration et procédure de pause FREE.
8. Vérifier GitHub Actions sur le commit final, le build `dist/`, puis seulement ensuite ouvrir une validation de préproduction.
9. Ne pas fusionner `main`, ne pas déployer Render/Supabase Production et ne pas activer de transports commerciaux sans validation explicite du propriétaire.

**Choix final unique : `NON PRÊT`.** Un blocage critique subsiste : l'absence de vérification sur le projet Supabase FREE réel. Le code local est durci et testé, mais l'intégration réelle, les données et la disponibilité ne sont pas prouvées. `PRÊT POUR PRÉPRODUCTION` et `PRÊT POUR LANCEMENT` sont donc exclus.


---

## 11. Addendum — clôture technique

`[CORRIGÉ]` La phase finale a ajouté : détection d'environnement sûre sans `production` forcé, validation de la configuration publique, messages explicites d'absence de migrations, `DROP POLICY IF EXISTS` sur toutes les policies finales, suppression de `platform_config_select_all`, tests de réexécution/compatibilité historique, tests d'isolement multi-utilisateurs et de claims disjoints, refactor Deno testable du worker, 15 scénarios Deno locaux sans `--allow-net`, `actions/checkout@v6`, `actions/setup-node@v6`, Node.js 22 et `npm run test:worker`.

`[TESTÉ LOCAL]` Les cinq commandes obligatoires et `npm run test:worker` ont été réexécutées après ces corrections ; les résultats détaillés sont dans [AUDIT-FINAL.md](AUDIT-FINAL.md). PGlite reste une preuve locale à connexion unique ; Deno local reste une preuve de compilation/lint/logique simulée, pas du runtime Edge déployé.

`[VÉRIFIÉ GITHUB]` Le commit de clôture `40a2178` a le run [45880393886](https://github.com/aydiarra-star/Jotcolis/actions/runs/45880393886) `success`, check-run/job `140117964589` `success`, 12 étapes réussies et 0 annotation. Les runs de la branche sont consultables via <https://github.com/aydiarra-star/Jotcolis/actions?query=branch%3Aarena%2Fb65591cf-jotcolis>. Le détail final est consigné dans [AUDIT-FINAL.md](AUDIT-FINAL.md) et dans la livraison finale.

`[ACCÈS SUPABASE REQUIS]` / `[AUTORISATION PROPRIÉTAIRE]` Aucune vérification distante, migration Supabase, déploiement Render/Edge, envoi externe, donnée réelle ou modification de facturation n'a été ajoutée. Le statut de clôture est `C — CODE FINALISÉ MAIS VALIDATION BLOQUÉE PAR DES ACCÈS OU AUTORISATIONS MANQUANTS`.
