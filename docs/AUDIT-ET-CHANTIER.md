# JotColis — audit, chantier et état réel

Date du rapport : 2026-11-26 (UTC). Branche : `arena/b65591cf-jotcolis`, base `bda2c41b44c20a7920b84646594f08a374bac223` de `main`. Dépôt officiel : `aydiarra-star/Jotcolis`. Ce document remplace l'ancienne lecture « prototype / démo » du README. Il sépare strictement ce qui a été **vérifié localement** de ce qui reste **non vérifié sur les services vivants**.

> **Addendum du 26 novembre 2026** : ce rapport décrit l'état de la première phase, avec 39 tests locaux. La phase 2 a ensuite corrigé l'activation des notifications, les états prestataires, les claims ambigus, l'exposition de `platform_config` et l'idempotence de certaines fonctions ; elle porte la suite à 52 tests. Les résultats et limites actualisés sont dans [AUDIT-PHASE-2.md](AUDIT-PHASE-2.md). La conclusion reste `NON PRÊT`. Les chiffres « 39 tests » ci-dessous sont historiques et ne doivent pas être lus comme l'état courant.

> **Addendum final** : la clôture technique est documentée dans [AUDIT-FINAL.md](AUDIT-FINAL.md) et les limites Free dans [SUPABASE-FREE.md](SUPABASE-FREE.md). Aucun chiffre de test de ce rapport historique ne décrit l'état courant.

## 1. État initial vérifié

Le dépôt était propre, sans commit supplémentaire sur la branche. `main` correspondait au merge de la PR #9 ; la PR #2 documentaire était encore ouverte. Le projet consistait en un site statique sans dépendance runtime : `index.html`, `app.js`, `styles.css`, `premium.css`, `experience.css`, `journey-globe.js`, `supabase-config.js`, six migrations SQL de brouillon et trois fichiers de tests statiques. Le build copiait sept fichiers dans `dist/`. La CI s'exécutait sur `main` et `feature/fondations-jotcolis`, pas sur la branche de chantier. `render.yaml` décrivait un blueprint statique `jotcolis-preview` avec previews automatiques ; ce n'est pas la preuve de la configuration du service officiel `srv-dbhq75gn74is73eog6sg`.

Éléments contraires aux exigences constatés dans le code : cartes de trajets de démonstration générées au chargement, mentions « GP vérifiés » et « Pièce d'identité et téléphone contrôlés » sans décision serveur, alertes GP en `localStorage`, fiche passeport `JC-EXEMPLE-2048`, code `JC-4829`, étapes « Place confirmée » et « Colis vérifié et remis au GP » présentées comme exemple, message de contact sans persistance réelle, publication automatique d'un brouillon vers un trajet, absence de réinitialisation de mot de passe, absence de rôles serveur, de workflow GP, de réservation atomique, de codes serveur, de notifications fiables, d'admin, d'audit immuable et de blocage juridique. Les 33 tests alors revendiqués étaient essentiellement des assertions de chaînes sur cet ancien comportement.

## 2. Périmètre et règles appliquées

Aucune autre application, aucun autre projet et aucun autre dépôt n'ont été touchés. Aucune clé secrète, aucune clé `service_role`, aucun jeton de prestataire et aucune donnée réelle n'ont été introduits. Aucune suppression de données, migration destructive, souscription payante, activation commerciale ou mise en production n'a été effectuée. Les migrations historiques ont été conservées ; les nouvelles migrations sont additives et idempotentes sur les objets qu'elles créent. Le premier administrateur ne peut être amorcé que par un appel privilégié `service_role`, jamais depuis le navigateur. Le frontend ne contient que la clé publique Supabase déjà présente.

## 3. Vérifications locales et limites d'accès

Vérifié localement : arbre Git, historique, fichiers, migrations SQL exécutées dans un PostgreSQL embarqué PGlite 0.6.0, logique SQL, RLS, privilèges, parcours jsdom avec client Supabase simulé, build statique et absence de secrets dans les fichiers. Les tests utilisent uniquement des comptes et données fictifs en mémoire.

Non vérifié sur les services vivants : schéma réel de Supabase, état d'Auth, utilisateurs, rôles, politiques RLS, buckets Storage, Edge Functions, Security Advisor, sauvegardes, variables d'environnement, journaux Render, branche et commit servi par `https://jotcolis-main-preview.onrender.com/#accueil`, état du service `srv-dbhq75gn74is73eog6sg`. Aucun connecteur Supabase/Render n'est disponible, aucun token d'accès n'est présent dans l'environnement, et les endpoints Supabase/Render ont retourné `000`/injoignable depuis le sandbox. Aucune affirmation de parité avec la base distante n'est donc faite.

## 4. Problèmes détectés et corrections fonctionnelles

| Problème | Correction | Fichiers / tables | Risque résiduel |
| --- | --- | --- | --- |
| Faux trajets et fausses confirmations | Suppression du rendu de démonstration ; recherche exclusivement via `search_trips` ; état vide sans exemple | `app.js`, `platform.js`, `index.html` | Une vue publique ne peut être jugée réelle qu'après application des migrations et vérification Supabase |
| Alertes locales | `trip_alerts` en base avec consentement, RPC `create_trip_alert` et notification réelle ou bloquée explicitement | migrations 002/003, `app.js` | Aucun envoi externe tant qu'un provider officiel n'est pas configuré |
| Auth incomplète | signup, signin, signout, confirmation, réinitialisation, récupération, session, profil complet, compte inactif | `platform.js`, `index.html`, `assert_active_account` | Paramètres Auth (SMTP, redirections, taux de confirmation) non vérifiés en ligne |
| Rôles manipulables | table `user_roles`, trigger d'inscription, `current_user_is_admin`, bootstrap `service_role` uniquement | migrations 002/003/004 | Le premier admin doit être créé par le propriétaire via SQL Editor ou opération privilégiée |
| GP auto-déclaré vérifié | sept statuts, contrôles distincts, documents privés, historique immuable, décision admin motivée | `gp_verifications`, `verification_documents`, `gp_verification_events`, RPC | Les documents réels et la procédure de contrôle humain doivent être définis par le propriétaire |
| Publication non maîtrisée | brouillon, publication conditionnée au GP approuvé, liaison active, porte juridique, date future et capacité | `create_trip_draft`, `publish_my_trip` | Tarification et conditions commerciales non validées |
| Pas de réservation serveur | demande, acceptation/refus, verrou `FOR UPDATE`, capacité atomique, montant calculé serveur, annulation idempotente | `parcel_requests`, `bookings`, `respond_to_request` | Concurrence multi-connexions réelle non prouvée par PGlite seul |
| Passeport fictif | référence `JC-ANNÉE-...` générée serveur, événements chaînés SHA-256, immutables, transitions déclarées | `passport_events`, `booking_event_rules`, `advance_booking` | Nécessite une vérification du suivi public en préproduction |
| Code de remise faible | code imprévisible à usage unique, sel + hachage, expiration, tentatives, vérification serveur, secours admin audité | `delivery_codes`, `issue_delivery_code`, `verify_delivery_code`, `admin_handover_fallback` | Le code en clair n'est affiché qu'une fois ; aucun envoi automatique au destinataire |
| Fausses notifications | outbox, historique immuable, statuts `blocked/pending/claimed/sent/failed/dead`, tentatives, worker non déployé | `notification_outbox`, `notification_attempts`, Edge Function | Prestataire e-mail et WhatsApp Cloud API officiels non choisis ni testés |
| Pas d'administration | console admin conditionnelle, revue GP, comptes, rôles, corridors, trajets, incidents, validations, drapeaux, audit | `admin_overview`, RPC `admin_*`, `platform.js` | Interface admin à tester avec comptes réels de préproduction |
| Absence de blocage légal | `legal_validations`, catégories de marchandises, porte FR/SN, CGU/privacy, références de corridors | migrations 002/003/004 | Aucune validation juridique réelle n'a été inventée |

## 5. Fonctionnalités développées

Le frontend conserve l'identité orange, le globe illustratif clairement signalé « aucun suivi GPS », la navigation mobile et les styles historiques. Il expose désormais : recherche de trajets réels, état vide utile avec alerte serveur, publication en brouillon puis publication contrôlée, dépôt de demande avec déclaration du contenu, suivi public par référence, espace privé avec profil, rôles, dossier GP, demandes, trajets, réservations, passeport, incidents et notifications, console d'administration conditionnelle, formulaires de réinitialisation et de nouveau mot de passe, bannière d'état d'exploitation. Aucun bouton ne prétend contacter directement un voyageur ni envoyer un message non prouvé.

## 6. Architecture et modèle de données

Le navigateur ne peut pas modifier directement les statuts sensibles : il appelle des RPC `SECURITY DEFINER` avec `search_path=''`, dérivant l'identité de `auth.uid()` et écrivant un audit. Les lectures publiques passent par des vues à `security_barrier` et des RPC en moindres privilèges. Les tables ajoutées couvrent rôles, vérification GP, documents, configuration, validations juridiques, marchandises, alertes, notifications, codes, notes et preuves d'incident. `audit_logs`, `passport_events`, `notification_attempts` et `gp_verification_events` sont protégés contre `UPDATE`/`DELETE`. Les statuts demandés sont ajoutés aux enums sans supprimer les valeurs historiques. Les transitions de réservation sont déclarées dans `booking_event_rules`, pas codées en dur côté client.

## 7. Sécurité

RLS est activée sur toutes les tables métier. Les privilèges PostgreSQL implicites accordés à `PUBLIC` sont révoqués, puis seules les RPC et vues sûres sont accordées à `anon`/`authenticated`. Les fonctions internes, le bootstrap admin et le worker de notifications ne sont pas exécutables par le navigateur. Les documents sont dans des buckets privés avec politiques Storage sur le préfixe `auth.uid()`. Aucun ID, hash, sel, numéro de téléphone ou e-mail n'est exposé dans la vue publique du passeport. Les codes sont hachés avec SHA-256 et sel aléatoire ; pour un secret à longue durée, un KDF côté serveur devra être ajouté avant production. Le frontend n'a aucune clé `service_role`.

## 8. Notifications et coûts

Aucun prestataire n'a été choisi, payé ou configuré. Le canal `in_app` est enregistré comme disponible ; les canaux e-mail et WhatsApp restent `blocked` tant que les drapeaux serveur ne sont pas activés. Le worker `supabase/functions/notification-worker/index.ts` existe mais **n'est pas déployé** : il lit ses secrets via `Deno.env`, n'écrit `sent` qu'après une réponse HTTP 2xx et utilise uniquement l'API Cloud officielle Meta pour WhatsApp. Aucun message n'est marqué envoyé sans preuve fournisseur. Le code de remise n'est jamais inclus dans la charge utile de notification. Coûts potentiels à valider par le propriétaire : hébergement Render, plan Supabase, stockage, e-mails transactionnels, WhatsApp Cloud API, supervision, sauvegardes et conseils juridiques.

## 9. Conformité juridique France / Sénégal

La porte commerciale exige des références documentées pour les deux juridictions sur le modèle économique, les règles de transport, les douanes, les compagnies aériennes, les assurances, la protection des données et les conditions générales. Les catégories de marchandises interdites ou restreintes sont indicatives et doivent être validées une par une avec référence. Aucune assertion de conformité légale n'a été inventée. La procédure de contrôle du contenu, la responsabilité du voyageur, la limitation des marchandises, les obligations douanières, les règles IATA/compagnies, la gestion RGPD et les CGU/CGV opposables restent des blockers de lancement. Le propriétaire doit fournir les validations professionnelles ; l'application ne les génère pas.

## 10. Changements GitHub, Supabase et Render

GitHub : modifications sur `arena/b65591cf-jotcolis` uniquement, poussées sur cette branche ; CI étendue à toutes les branches avec `npm ci`, tests et build. Supabase : quatre nouvelles migrations SQL et un dossier d'Edge Function non déployée ; **aucune migration n'a été appliquée à la base distante**. Render : le blueprint de dépôt ne déclare plus de previews automatiques et utilise `npm ci && npm test && npm run build` ; **le service officiel, son auto-déploiement, ses variables et ses logs n'ont pas été modifiés ni vérifiés**. Aucun commit de ce chantier n'a été fusionné dans `main`, aucun déploiement n'a été déclenché volontairement.

## 11. Tests exécutés et résultats

`npm test` exécute désormais des tests statiques, des tests d'intégration SQL dans PGlite et des tests de parcours navigateur jsdom. Les anciens tests qui verrouillaient le comportement de démonstration ont été remplacés. Résultats locaux : **39 tests / 39 réussis**, dont 12 sous-tests d'intégration SQL (migrations, RLS, privilèges PUBLIC, Auth, porte juridique, GP, recherche, idempotence, atomicité, passeport, annulation, secours admin, notifications, stockage privé, audit, worker), 8 tests jsdom (absence de démo, recherche serveur, erreur backend, demande, suivi public, mot de passe oublié, signout, e-mail non confirmé), et 19 tests statiques d'architecture/identité/migrations. `npm run build` vérifie la copie de tous les assets ; un serveur statique local de prévisualisation a ensuite retourné HTTP 200 pour `/`, `platform.js`, `platform.css`, `app.js`, `supabase-config.js` et le rapport d'audit. Aucun test ne touche une donnée utilisateur réelle.

Limite explicite : PGlite est un moteur PostgreSQL en mémoire à connexion unique. Les tests prouvent les verrous, l'atomicité transactionnelle et le refus de surréservation dans des appels successifs, mais **pas** une concurrence réseau multi-clients avec plusieurs connexions. Une tentative antérieure de pont socket PGlite/node-postgres a échoué (`ECONNREFUSED`, puis `Connection terminated unexpectedly`) et n'est pas utilisée comme preuve. Des tests multi-utilisateurs et de charge sur une base Supabase de préproduction restent obligatoires.

## 12. Robustesse, accessibilité et expérience

Les formulaires ont des labels, des retours `aria-live`, des états de chargement, des messages d'erreur contextualisés, des consentements explicites et des validations côté serveur. Les composants ajoutés utilisent les variables de palette existantes, des grilles responsives, un focus visible, des cibles tactiles et `prefers-reduced-motion`. Les erreurs backend n'affichent jamais de données de remplacement. Les écritures à double clic sont protégées par clé d'idempotence et verrouillage du bouton après succès. Les événements du passeport sont horodatés par le serveur et ne peuvent pas être antidatés par le client.

## 13. Opérations, sauvegardes et restauration

Aucune sauvegarde, restauration, rotation de secrets ou supervision n'a été effectuée : ces actions exigent l'accès propriétaire aux consoles Supabase/Render. À mettre en place avant préproduction : inventaire des secrets serveur, plan de sauvegarde Supabase testé, procédure de restauration documentée, séparation développement/préproduction/production, journaux du worker, alertes sur `notification_outbox` en `dead`, supervision des erreurs RPC, plan de reprise, registre des accès administrateurs et procédure de révocation. Le dépôt ne contient aucun secret ; un fichier `.env.example` documente uniquement les noms de variables.

## 14. Préproduction requise

1. Obtenir l'accès propriétaire aux projets Supabase `rzezmtahqrxiivdjfajo` et Render `srv-dbhq75gn74is73eog6sg`.
2. Comparer le schéma distant aux six migrations historiques, sauvegarder la base, puis appliquer les quatre nouvelles migrations dans un environnement de préproduction.
3. Créer le premier administrateur via SQL privilégié avec `bootstrap_first_admin`, jamais depuis le navigateur.
4. Configurer Auth : confirmation d'e-mail, redirections, reset, modèles, limites anti-abus et comptes fictifs.
5. Créer les buckets privés et vérifier les policies Storage avec deux comptes distincts.
6. Déployer le worker de notifications uniquement après choix contractuel du prestataire, configuration des secrets et tests sandbox.
7. Exécuter des scénarios multi-utilisateurs réels : deux expéditeurs sur la même capacité, annulation concurrente, GP suspendu, expiration de code, incident, secours admin, notifications échouées puis rejouées.
8. Mesurer les temps de recherche, publication et réservation, puis vérifier les journaux, l'audit et les sauvegardes.

## 15. Fonctionnalités encore bloquées

Blocages critiques : absence de vérification/accès aux services vivants, migrations non appliquées à Supabase, validations juridiques réelles absentes, prestataire e-mail non choisi, WhatsApp officiel non autorisé, CGU/CGV/RGPD opposables non fournis, règles douanières et aériennes non validées, premier administrateur non créé en ligne, tests de concurrence multi-connexions non exécutés, supervision et sauvegardes non vérifiées, configuration Render non vérifiée. Les drapeaux `commercial_open`, `legal_validation_complete`, `notifications_enabled` et `pricing_config_validated` sont fermés par défaut ; les tests qui les ouvrent utilisent une base locale jetable et des références de test sans valeur juridique. Aucune réservation commerciale réelle n'est donc activée.

## 16. Conclusion et conditions de lancement

**Conclusion : `NON PRÊT`.**

Le chantier a supprimé les simulations du frontend et ajouté une architecture serveur contrôlée, des parcours complets, des garde-fous RLS/RPC, une porte juridique et des tests d'intégration locaux réels. Il ne permet pas de lancer commercialement JotColis : un seul blocker critique non résolu interdit la mise à disposition au public, ici l'absence de vérification/application sur les services Supabase/Render vivants combinée à l'absence de validations juridiques et de canaux de notification officiels. Le passage à `PRÊT POUR PRÉPRODUCTION` exige au minimum la section 14 entièrement exécutée et tracée. Le passage à `PRÊT POUR LANCEMENT` exige en plus l'autorisation explicite du propriétaire, des validations professionnelles France/Sénégal, des tests multi-utilisateurs et de charge réussis, une restauration testée, une supervision opérationnelle et une revue de sécurité sur l'environnement qui sera réellement servi. Aucune de ces conditions n'est aujourd'hui satisfaite sur les services vivants.
