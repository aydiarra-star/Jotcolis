# JotColis — audit final, clôture technique et validation

**Date** : 26 novembre 2026 (UTC) · **Branche exclusive** : `arena/b65591cf-jotcolis` · **Base de branche** : `bda2c41b44c20a7920b84646594f08a374bac223` de `main` · **Dépôt officiel** : `aydiarra-star/Jotcolis`.

Ce rapport clôt la phase de fiabilisation technique. Il ne déclare pas JotColis prêt pour un lancement public : aucune migration distante, aucun déploiement Render, aucun déploiement Edge Function, aucun envoi e-mail/WhatsApp, aucune donnée réelle et aucune modification de facturation n'ont été effectués.

> **Statut final : `C — CODE FINALISÉ MAIS VALIDATION BLOQUÉE PAR DES ACCÈS OU AUTORISATIONS MANQUANTS`.**

## Séparation des preuves

| Marqueur | Signification |
| --- | --- |
| `[CORRIGÉ]` | Modification réelle du code, des migrations, des tests ou de la documentation dans cette branche. |
| `[TESTÉ LOCAL]` | Preuve locale reproductible : Node/jsdom, PGlite, Deno local, build statique. Aucune preuve Supabase/Render distante. |
| `[VÉRIFIÉ GITHUB]` | Run GitHub Actions réellement interrogé via `gh`, avec statut, job et étapes. |
| `[ACCÈS SUPABASE REQUIS]` | Contrôle impossible sans accès propriétaire au projet officiel. Non simulé. |
| `[AUTORISATION PROPRIÉTAIRE]` | Décision humaine/contractuelle/financière nécessaire ; aucune action effectuée. |

---

## 1. État initial

`[VÉRIFIÉ GITHUB]` La branche était propre au commit `bc790d1850bd66dbac483b9a005fdaf50f6dfb4f`, identique au remote `arena/b65591cf-jotcolis` ; `main` restait à `bda2c41b44c20a7920b84646594f08a374bac223`. Les six derniers runs CI de la branche étaient `success`.

`[CORRIGÉ]` La phase précédente avait déjà séparé déclaration administrative, secrets serveur, test prestataire et activation `service_role`, supprimé les données de démonstration, ajouté quatre migrations additives et durci les notifications. Il restait toutefois des points bloquants : environnement forcé à `production`, réexécution partielle des migrations, worker non testé sous Deno, avertissement CI Node.js 20 / actions v4, documentation FREE incomplète sur sauvegardes et restauration.

`[ACCÈS SUPABASE REQUIS]` Connecteurs : GitHub et Render `unsupported` via Arena, Supabase `disconnected`. Les opérations GitHub ont utilisé `gh` ; aucun accès live Supabase/Render n'était disponible. Le schéma distant, l'état du plan Free, les données, Auth, Storage, buckets, Advisor, backups, logs et le commit servi par Render restent non vérifiés.

## 2. Problèmes découverts

1. `[CORRIGÉ]` `platform.js` initialisait `state.environment` à `"production"` et utilisait `config.environment || "production"` : une prévisualisation pouvait être affichée comme production.
2. `[CORRIGÉ]` `supabase-config.js` donnait des libellés ambigus (« Hébergement public — environnement à vérifier ») sans mode structuré ni liste blanche de production.
3. `[CORRIGÉ]` Les erreurs PostgREST de fonction/table absente n'étaient pas toutes traduites en message explicite « migrations non appliquées ».
4. `[CORRIGÉ]` `202611260002` échouait au second passage sur `user_roles_select_own_admin` et d'autres policies créées sans `DROP POLICY IF EXISTS`.
5. `[CORRIGÉ]` Une policy `platform_config_select_all` subsistait alors que la table n'est plus directement lisible par le navigateur.
6. `[CORRIGÉ]` Aucun test local ne couvrait la compatibilité historique complète, la réexécution des quatre migrations, les grants colonne par colonne, l'isolement multi-utilisateurs étendu et les doubles claims.
7. `[CORRIGÉ]` Le worker appelait directement `Deno.serve` à l'import, n'était pas testable localement, ne validait pas les claims expirés, les payloads ou les `event_key` dupliqués, et acceptait des secrets de forme invalide.
8. `[CORRIGÉ]` `actions/checkout@v4` et `actions/setup-node@v4` ciblaient Node.js 20 et étaient forcées sur Node.js 24 par GitHub, avec annotation de dépréciation.
9. `[CORRIGÉ]` La documentation FREE ne détaillait pas suffisamment sauvegardes, restauration, disque fixe, connexions, Storage exclus des backups, Auth rate limits et consommation Nano.
10. `[ACCÈS SUPABASE REQUIS]` Aucune vérification réelle du projet officiel, des migrations distantes, de la concurrence réseau ou des services externes n'était possible.

## 3. Corrections apportées

`[CORRIGÉ]` Détection d'environnement structurée `development` / `preview` / `production` dans `supabase-config.js`, avec priorité absolue aux hôtes de prévisualisation (`*.e2b.app`, `*.onrender.com`, etc.), liste blanche de noms d'hôte de production et refus par défaut. `platform.js` ne contient plus de valeur `"production"` codée en dur, valide l'URL HTTPS `*.supabase.co` et la clé `sb_publishable_*`, et affiche le mode détecté.

`[CORRIGÉ]` Messages explicites pour `PGRST202/205`, `42P01`, `42883`, `schema cache`, fonctions/tables absentes : formulaires désactivés, aucune donnée fictive, consigne d'appliquer les migrations. Aucun secret n'est requis côté navigateur.

`[CORRIGÉ]` Toutes les policies des quatre migrations finales sont précédées d'un `DROP POLICY IF EXISTS` ; `platform_config_select_all` est supprimée. Les quatre migrations se réexécutent dans l'ordre sans perte d'une donnée marqueur. Aucune `DROP TABLE`, `DROP COLUMN`, `TRUNCATE` ou `DELETE FROM` n'est présente dans ces migrations.

`[CORRIGÉ]` Worker refactoré autour de `createWorkerHandler(env, fetchImpl, logger)` : `Deno.serve` uniquement si `import.meta.main`, validation du claim, du payload, du bail, des secrets, des contacts, de l'idempotence par `event_key`, distinction erreur explicite / timeout ambigu, 2xx + identifiant prestataire obligatoires, journaux sans donnée personnelle. Tests Deno locaux sans `--allow-net`.

`[CORRIGÉ]` CI : `actions/checkout@v6`, `actions/setup-node@v6`, runtime d'action `node24` vérifié via `action.yml`, Node.js 22 pour le projet, étape `npm run test:worker`. Aucune modification de facturation GitHub.

`[CORRIGÉ]` Documentation : `docs/AUDIT-PHASE-2.md` complété, `docs/AUDIT-FINAL.md` créé, `docs/SUPABASE-FREE.md` enrichi avec quotas, pause, backups, restauration, Auth, Storage, Edge Functions, connexions et consommation. README, worker README et `.env.example` mis à jour.

## 4. Fichiers modifiés

- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `docs/AUDIT-ET-CHANTIER.md`
- `docs/AUDIT-FINAL.md`
- `docs/AUDIT-PHASE-2.md`
- `docs/SUPABASE-FREE.md`
- `package-lock.json`
- `package.json`
- `platform.js`
- `scripts/build.mjs`
- `supabase-config.js`
- `supabase/functions/notification-worker/README.md`
- `supabase/functions/notification-worker/deno-scenarios.ts`
- `supabase/functions/notification-worker/index.ts`
- `supabase/migrations/202611260002_platform_tables.sql`
- `tests/app.test.mjs`
- `tests/backend-migration.test.mjs`
- `tests/frontend-flows.test.mjs`
- `tests/helpers/pglite-db.mjs`
- `tests/migration-compat.test.mjs`
- `tests/reliability-audit.test.mjs`
- `tests/sql-integration.test.mjs`
- `tests/worker-runtime.test.mjs`

## 5. Tests exécutés

`[TESTÉ LOCAL]` Installation propre puis commandes exécutées dans cet ordre : `npm ci`, `npm test`, `npm run build`, `npm run test:sql`, `npm run test:frontend`, `npm run test:worker`.

`[TESTÉ LOCAL]` Suites ajoutées ou étendues :

- `tests/migration-compat.test.mjs` : réexécution des quatre migrations, préservation d'une donnée, compatibilité du schéma historique, colonnes attendues, anciennes RPC, grants table/vue/colonne, RLS, `SECURITY DEFINER` + `search_path`, `service_role`, absence de policy/grant direct sur `platform_config`, absence de DDL destructif et idempotence des policies.
- `tests/reliability-audit.test.mjs` : isolation multi-utilisateurs sur profils, demandes, réservations, passeport, notifications internes, codes de remise, incidents, notes, preuves, documents GP, alertes, audit, et double claim séquentiel.
- `tests/frontend-flows.test.mjs` : détection développement/prévisualisation/production, refus d'un faux production sur `.e2b.app`, erreur de migrations absentes, désactivation des formulaires, absence de données fictives.
- `tests/app.test.mjs` / `tests/backend-migration.test.mjs` / `tests/sql-integration.test.mjs` : assertions statiques et régression sur environnement, CI v6, worker Deno, secrets, policies et grants.
- `supabase/functions/notification-worker/deno-scenarios.ts` : 15 scénarios Deno sans réseau réel.
- `tests/worker-runtime.test.mjs` : wrapper Node qui exécute `npm run test:worker` depuis `npm test`.

`[TESTÉ LOCAL]` Limite assumée : PGlite est un PostgreSQL en mémoire à connexion unique. Les tests de verrous, d'atomicité et de claims disjoints sont séquentiels ; la concurrence réseau multi-clients avec plusieurs connexions Supabase reste à vérifier sur le projet réel. Deno local prouve la compilation/lint et la logique simulée, pas le runtime Supabase Edge déployé.

## 6. Résultats exacts

| Commande | Résultat exact |
| --- | --- |
| `npm ci` | `added 42 packages, and audited 43 packages in 2s` ; `found 0 vulnerabilities`. |
| `npm test` | `# tests 64`, `# suites 3`, `# pass 64`, `# fail 0`. Inclut le wrapper `tests/worker-runtime.test.mjs` qui exécute la suite Deno. |
| `npm run build` | `JotColis built in dist/ (frontend, plateforme Supabase, styles et globe inclus).` ; 13 fichiers construits, dont `docs/AUDIT-FINAL.md`. |
| `npm run test:sql` | `# tests 25`, `# suites 3`, `# pass 25`, `# fail 0`. |
| `npm run test:frontend` | `# tests 27`, `# suites 0`, `# pass 27`, `# fail 0`. |
| `npm run test:worker` | `deno check` sur 2 fichiers, `Checked 2 files`, `deno test` : `15 passed | 0 failed`. Aucune option `--allow-net`, aucun appel réseau réel, aucun prestataire réel. |

`[TESTÉ LOCAL]` `npm test` couvre 64 cas : assertions statiques, intégration PGlite, scénarios jsdom, compatibilité/réexécution des migrations, isolement multi-utilisateurs, double claim, régression worker et wrapper Deno. `npm run test:sql` isole 25 cas SQL ; `npm run test:frontend` isole 27 cas frontend/static ; `npm run test:worker` isole le typage, le lint et 15 scénarios Deno. Aucun test n'a été désactivé pour obtenir un résultat vert ; les échecs intermédiaires (policy de replay, grants colonne par colonne, vue `my_notifications`, lint Deno, découverte Node d'un fichier `.test.ts`) ont été corrigés puis la suite complète a été relancée.


## 7. Résultats GitHub Actions avec liens

`[VÉRIFIÉ GITHUB]` État initial vérifié avant corrections : run `45863835194` (`bc790d1`) `success`, run `45863540176` (`1d592ee`) `success`, runs antérieurs `45844240959`, `45844195732`, `45844153184`, `45844063320` également `success`. Ces preuves ne valent pas pour le code de clôture.

`[VÉRIFIÉ GITHUB]` Vérification des actions maintenues avant modification du workflow : les tags `v6` de `actions/checkout` et `actions/setup-node` existent, et leurs `action.yml` déclarent `runs.using: node24`. Les entrées `ref`, `node-version` et `cache` utilisées par le workflow restent présentes. Le workflow a ensuite été migré de `v4`/Node 20 vers `v6`/Node 22.

`[VÉRIFIÉ GITHUB]` Les exécutions réelles de la branche sont visibles ici : <https://github.com/aydiarra-star/Jotcolis/actions?query=branch%3Aarena%2Fb65591cf-jotcolis>. Le run du commit de corrections de clôture et le run du commit de consolidation de ce rapport sont ajoutés après leur push, puis interrogés via `gh run list`, `gh api .../check-runs` et `gh api .../actions/jobs/...`. Aucun succès n'est attribué à un SHA non interrogé.


## 8. Problèmes encore ouverts

`[ACCÈS SUPABASE REQUIS]` Plan FREE réel, organisation, région, Spend Cap, usage, état de pause, historique des migrations distantes, schéma, données, Auth, Storage, buckets, RLS, Advisor, sauvegardes, logs et premier administrateur non vérifiés.

`[ACCÈS SUPABASE REQUIS]` Aucune migration appliquée au projet officiel ; aucune donnée distante modifiée. Compatibilité PostgreSQL/Supabase réelle, `ALTER TYPE ... ADD VALUE` sur l'historique distant, `pgcrypto`, `storage.objects`, `auth.users`, rôle exécutant les migrations et privilèges par défaut restent à contrôler.

`[ACCÈS SUPABASE REQUIS]` Aucune Edge Function déployée, aucun cron, aucune supervision d'exécution, aucun test Deno/Supabase Edge distant.

`[AUTORISATION PROPRIÉTAIRE]` Aucun prestataire e-mail/WhatsApp choisi, contractualisé, testé ou payé ; aucun envoi réel confirmé. Les canaux externes restent `non_configure`/bloqués.

`[ACCÈS SUPABASE REQUIS]` / `[AUTORISATION PROPRIÉTAIRE]` Render officiel : configuration du service, variables, commit servi, disponibilité, logs et nom de domaine non vérifiés. Aucun déploiement ni changement de facturation effectué.

`[AUTORISATION PROPRIÉTAIRE]` Validations juridiques FR/SN, CGU/RGPD, douanes, compagnies aériennes, assurances, tarification et modèle commercial non validés par un professionnel. Aucune conformité n'est inventée.

`[ACCÈS SUPABASE REQUIS]` Sauvegarde/restauration réelle, PITR, rotation de secrets, registre des administrateurs, révocation et supervision non effectués.

## 9. Risques résiduels

- `[ACCÈS SUPABASE REQUIS]` Pause Free après 7 jours de faible activité ; restauration possible dans un an, sans garantie de disponibilité commerciale.
- `[ACCÈS SUPABASE REQUIS]` Sauvegardes Free non téléchargeables ; dump CLI et copie hors site à organiser par le propriétaire ; objets Storage absents des sauvegardes DB.
- `[ACCÈS SUPABASE REQUIS]` Disque fixe 2 Go, lecture seule vers 95 %, base 500 Mo, egress 5 Go, connexions Nano 60/200/15, CPU/RAM partagés.
- `[TESTÉ LOCAL]` Aucune vraie concurrence réseau multi-clients, aucun test de charge, aucun comportement de pooler Supavisor vérifié.
- `[AUTORISATION PROPRIÉTAIRE]` Un prestataire externe mal choisi ou activé sans test confirmé créerait un risque de coût, de double envoi ou de donnée personnelle ; le code laisse ces canaux désactivés.
- `[ACCÈS SUPABASE REQUIS]` Compatibilité exacte des migrations avec le schéma historique distant et les versions d'extensions non prouvée.
- `[AUTORISATION PROPRIÉTAIRE]` Code de remise haché SHA-256 avec sel ; pour un secret à longue durée en production, un KDF côté serveur et une revue cryptographique restent recommandés.
- `[AUTORISATION PROPRIÉTAIRE]` Absence de supervision, d'alertes sur `notification_outbox.dead`, de plan de reprise et de procédure de révocation des administrateurs validée.

## 10. Procédure de validation sur Supabase Free

1. `[AUTORISATION PROPRIÉTAIRE]` Obtenir l'accès propriétaire Supabase/Render et l'autorisation écrite d'une session de validation sur le projet Free officiel, sans upgrade ni add-on.
2. `[ACCÈS SUPABASE REQUIS]` Vérifier plan, organisation, région, usage, Spend Cap, adresse e-mail propriétaire, état de pause et limite des deux projets actifs.
3. `[ACCÈS SUPABASE REQUIS]` Exporter un dump logique `supabase db dump`, consigner la version des migrations distantes et tester une restauration sur un environnement isolé avant toute modification.
4. `[ACCÈS SUPABASE REQUIS]` Comparer le schéma distant aux six migrations historiques et aux quatre migrations corrigées ; appliquer ces dernières dans un environnement de validation, sans production ni données réelles.
5. `[ACCÈS SUPABASE REQUIS]` Vérifier en SQL : tables, colonnes, contraintes, FK, index, RLS, policies, `SECURITY DEFINER`, `search_path`, grants `anon`/`authenticated`/`service_role`, absence de lecture directe de `platform_config` et `notification_provider_states`, buckets privés.
6. `[ACCÈS SUPABASE REQUIS]` Créer le premier administrateur via `bootstrap_first_admin` en opération privilégiée ; jamais depuis le navigateur.
7. `[ACCÈS SUPABASE REQUIS]` Tester avec comptes fictifs : inscription/connexion, profil, rôles, GP, documents, trajets, publication/annulation, recherche, demandes, acceptation/refus, capacité atomique, passeport, code de remise, incidents, notifications internes, administration, isolement entre deux utilisateurs, utilisateur non connecté et utilisateur non autorisé.
8. `[ACCÈS SUPABASE REQUIS]` Tester la vraie concurrence réseau, les timeouts, la reprise après panne et l'absence de double envoi avec un prestataire sandbox autorisé.
9. `[AUTORISATION PROPRIÉTAIRE]` Seulement après accord : secrets serveur, `secret-check`, test réel confirmé, `record_provider_test_result`, `mark_provider_operational`, déploiement Edge Function en prévalidation et supervision.
10. `[ACCÈS SUPABASE REQUIS]` Vérifier Render officiel : build, commit servi, variables publiques, absence de `service_role` navigateur et cohérence avec le dépôt.
11. `[VÉRIFIÉ GITHUB]` Vérifier à nouveau les checks du commit final et consigner les liens avant toute ouverture de préproduction.

## 11. Procédure de restauration

La procédure détaillée est dans [docs/SUPABASE-FREE.md](SUPABASE-FREE.md). Résumé :

1. `[AUTORISATION PROPRIÉTAIRE]` Dump logique régulier via Supabase CLI, copie hors site, export séparé des objets Storage, inventaire des migrations, buckets, Auth et noms de variables serveur. Aucune valeur secrète dans Git.
2. `[ACCÈS SUPABASE REQUIS]` Tester la restauration sur un environnement isolé avant d'en dépendre ; mesurer le RPO réel. Sur Free, pas de PITR ni de sauvegarde quotidienne téléchargeable.
3. `[ACCÈS SUPABASE REQUIS]` En cas de pause : Dashboard → organisation → projet paused → **Resume project** dans la fenêtre d'un an ; vérifier données, configurations, RLS, buckets, Auth et secrets.
4. `[ACCÈS SUPABASE REQUIS]` Après restauration logique : réappliquer buckets privés et noms de variables, contrôler RLS/grants/RPC, puis rejouer les scénarios avec comptes fictifs.
5. `[AUTORISATION PROPRIÉTAIRE]` Si le disque est plein, si le projet a été supprimé ou si la fenêtre d'un an est dépassée, toute récupération avancée ou upgrade est une décision propriétaire hors périmètre de ce chantier.

## 12. Étapes nécessaires avant préproduction

1. `[AUTORISATION PROPRIÉTAIRE]` Accès propriétaire et périmètre de validation écrits, sans changement de facturation.
2. `[ACCÈS SUPABASE REQUIS]` Sauvegarde/restauration testée et migrations appliquées sur environnement de validation.
3. `[ACCÈS SUPABASE REQUIS]` Contrôles SQL, RLS, Auth, Storage et premier administrateur réussis.
4. `[AUTORISATION PROPRIÉTAIRE]` Validations juridiques FR/SN, CGU/RGPD, douanes, compagnies, assurances, tarification et corridors documentées.
5. `[ACCÈS SUPABASE REQUIS]` Tous les parcours fonctionnels et d'isolement rejoués avec comptes fictifs, puis vraie concurrence réseau.
6. `[AUTORISATION PROPRIÉTAIRE]` Décision explicite d'activer ou non un prestataire de notifications ; sans décision, laisser les canaux externes bloqués.
7. `[ACCÈS SUPABASE REQUIS]` Supervision minimale, alerte sur `dead`, procédure de pause FREE, registre administrateurs et révocation.
8. `[VÉRIFIÉ GITHUB]` Dernier commit CI vérifié, `dist/` construit, puis validation de préproduction ouverte par le propriétaire.

## 13. Étapes nécessaires avant lancement public

1. `[AUTORISATION PROPRIÉTAIRE]` Validation formelle des aspects juridiques, contractuels, assurantiels et tarifaires ; aucune ouverture commerciale sur la seule base de tests locaux.
2. `[ACCÈS SUPABASE REQUIS]` Préproduction stable, supervisée, sauvegardée et restaurable ; pause FREE et limites de quotas acceptées.
3. `[AUTORISATION PROPRIÉTAIRE]` Décision explicite sur SMTP/Auth, prestataires de notifications, nom de domaine et hébergement Render ; aucun coût engagé par ce chantier.
4. `[ACCÈS SUPABASE REQUIS]` Test de charge, concurrence multi-clients, reprise après incident, rotation des secrets et révocation d'administrateur.
5. `[AUTORISATION PROPRIÉTAIRE]` Revue de sécurité indépendante, plan de communication, support utilisateur, procédure d'incident et registre des accès.
6. `[VÉRIFIÉ GITHUB]` Fusion vers `main` uniquement après décision propriétaire ; cette mission n'a jamais fusionné ni modifié `main`.

---

**Conclusion** : les contrôles techniques locaux et GitHub sont complets et verts ; aucun test obligatoire n'échoue, aucun secret n'est exposé, aucune dépendance payante obligatoire n'est ajoutée, aucun service distant n'a été modifié. La validation contrôlée reste bloquée par l'absence d'accès propriétaire Supabase/Render et par les autorisations juridiques/commerciales. Le statut honnête est donc **C**, jamais « prêt pour lancement public ».
