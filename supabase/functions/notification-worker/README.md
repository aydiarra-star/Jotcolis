# Worker de notifications JotColis — état : NON DÉPLOYÉ

Ce dossier contient le code d'une Edge Function relue et durcie, mais **aucune fonction n'a été déployée, aucun prestataire n'a été choisi ou payé et aucun envoi réel n'a eu lieu**. Le frontend ne reçoit aucun secret de prestataire et ne peut activer aucun canal.

## Séparation stricte des états

La table serveur `public.notification_provider_states` stocke des états, jamais des secrets :

| État | Signification | Qui peut l'établir |
| --- | --- | --- |
| `non_configure` | Déclaration absente ou secrets serveur absents | état initial / contrôle serveur |
| `configure` | Secrets présents côté serveur, déclaration administrative active, aucun test confirmé | `report_provider_secret_check` (service_role) |
| `teste` | Un message de test réel a été confirmé par le prestataire : HTTP 2xx + identifiant de message | `record_provider_test_result` (service_role) |
| `operationnel` | Test confirmé puis activation explicite côté serveur | `mark_provider_operational` (service_role) |
| `en_erreur` | Échec explicite, confirmation absente ou résultat ambigu | `report_provider_error` / worker (service_role) |

`admin_set_provider_config` n'écrit **que** la déclaration administrative (`declared_active`, nom du prestataire, audit). Elle ne modifie jamais l'état serveur, n'active jamais `notifications_enabled` et ne débloque jamais de messages. Retirer une déclaration peut désactiver un canal ; la déclarer ne peut pas l'activer.

Les drapeaux `notifications_enabled`, `*_provider_configured` et `*_provider_state` dans `platform_config` sont **dérivés** par `sync_notification_provider_state()`. Ils ne sont pas des boutons d'activation.

## Actions du worker

Deux actions sont possibles, toujours protégées par l'en-tête `x-worker-secret` :

1. `x-worker-action: secret-check` — contrôle uniquement la **présence** des variables `Deno.env` et appelle `report_provider_secret_check` avec des booléens. Aucun appel prestataire, aucun test, aucun coût, aucune activation.
2. `x-worker-action: deliver` (défaut) — appelle `claim_notifications`, qui ne revendique que les lignes des canaux `operationnel`, puis appelle le prestataire officiel et `record_notification_result`.

Aucun mode automatique de test d'envoi n'est exposé : un test réel doit être explicitement autorisé par le propriétaire, effectué avec un compte de préproduction, puis enregistré côté serveur avec l'identifiant de message du prestataire. Aucun prestataire payant n'est requis pour les parcours internes.

## Règles d'envoi

1. Les événements métier écrivent une ligne `notification_outbox` via `enqueue_notification`. `in_app` crée une notification interne disponible ; les canaux externes non opérationnels restent `blocked` avec un motif explicite.
2. `claim_notifications` utilise `FOR UPDATE SKIP LOCKED`, un `claim_token` et un bail de deux minutes. Un bail expiré est un résultat ambigu : la ligne passe `blocked` avec `CLAIM_TIMEOUT_MANUAL_RECONCILIATION`, sans réessai automatique.
3. E-mail : endpoint HTTPS générique + jeton serveur + en-tête `Idempotency-Key`. WhatsApp : **WhatsApp Cloud API officielle Meta** avec template approuvé. Aucune API non officielle.
4. `sent` exige **à la fois** HTTP 2xx, un identifiant de message fourni par le prestataire, un claim valide et un état de canal `operationnel`. Un 2xx sans identifiant reste bloqué pour réconciliation : aucun faux succès.
5. Un non-2xx explicite est `failed` avec retry borné. Un timeout ou une exception réseau est `blocked` pour réconciliation manuelle, car le prestataire a pu accepter le message : cela évite un double envoi automatique.
6. Le corps e-mail/WhatsApp ne contient que des champs whitelistés (`label`, `instruction`, `parcel_code`) et aucun `payload` brut. Le code de remise n'est jamais dans `notification_outbox.payload`. Les journaux contiennent seulement des compteurs et des codes d'erreur, jamais de contact, secret, code ou réponse prestataire.
7. `record_notification_result` revérifie indépendamment le claim, le bail, le 2xx, l'identifiant prestataire et l'état opérationnel.

L'idempotence par `event_key` et `claim_token` empêche le double marquage en base. L'en-tête `Idempotency-Key` est envoyé au prestataire e-mail. WhatsApp Cloud API n'offre pas ici de garantie d'idempotence equivalente : les timeouts restent donc bloqués jusqu'à vérification humaine dans les journaux du prestataire.

## Variables d'environnement (côté serveur uniquement)

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injectées par Supabase Edge Functions. Ne jamais les mettre dans le frontend ni dans Git. |
| `NOTIFICATION_WORKER_SECRET` | Secret d'appel du worker (`x-worker-secret`). À générer hors dépôt. |
| `NOTIFICATION_EMAIL_ENDPOINT`, `NOTIFICATION_EMAIL_TOKEN` | Prestataire e-mail à choisir après vérification contractuelle, RGPD et coûts. |
| `WHATSAPP_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | Compte WhatsApp Business Platform / Cloud API officiel et template validé par Meta. |

Aucune autre variable, aucun cron, aucun service de file d'attente payant et aucune infrastructure supplémentaire ne sont requis par le code.

## Activation contrôlée, sans coût implicite

1. Vérifier les conditions, la protection des données et les coûts du prestataire, avec accord explicite du propriétaire.
2. Configurer les secrets dans l'environnement serveur, jamais dans ce dépôt.
3. Déclarer le canal via `admin_set_provider_config` : cela n'envoie rien et n'active rien.
4. Exécuter `secret-check` : constat serveur de présence des secrets, état `configure` au plus.
5. Après autorisation, effectuer un test réel en préproduction ; enregistrer le 2xx et l'identifiant prestataire via `record_provider_test_result` : état `teste`.
6. Activer explicitement via `mark_provider_operational` : état `operationnel`, `notifications_enabled` dérivé à `true`, déblocage contrôlé des seules lignes bloquées pour absence de prestataire.
7. Déployer la fonction en préproduction, vérifier `notification_outbox`, `notification_attempts`, `audit_logs` et les journaux prestataire avant toute ouverture commerciale.

## Ce qui reste explicitement bloqué

- Choix et contractualisation d'un prestataire e-mail.
- Compte WhatsApp Business officiel, validation du template et autorisation d'envoi.
- Test d'envoi réel confirmé par un prestataire.
- Déploiement de l'Edge Function, planification (cron) et supervision.
- Vérification sur le projet Supabase FREE réel.

Tant que ces points ne sont pas validés, l'application affiche qu'aucun envoi externe n'a eu lieu et ne prétend jamais qu'un message a été envoyé.
