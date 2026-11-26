# Worker de notifications JotColis — état : NON DÉPLOYÉ

Ce dossier contient le code d'une Edge Function prête à être relue, mais **aucune fonction n'a été déployée et aucun prestataire n'a été choisi ou payé**. Aucun e-mail ni message WhatsApp n'est envoyé aujourd'hui par JotColis.

## Principe

1. Les événements métier écrivent une ligne dans `public.notification_outbox` via `public.enqueue_notification` (fonction SQL serveur). Si aucun prestataire n'est configuré, la ligne reste `blocked` avec un motif explicite : aucun envoi n'est simulé.
2. Le worker revendique les lignes `pending`/`failed` avec `claim_notifications` (`FOR UPDATE SKIP LOCKED`, jeton de revendication).
3. Il appelle uniquement un prestataire officiellement configuré :
   - e-mail : endpoint HTTPS générique + jeton serveur ;
   - WhatsApp : **WhatsApp Cloud API officielle Meta** avec un template approuvé. Aucune API non officielle n'est utilisée.
4. Il n'écrit `sent` qu'après une réponse HTTP 2xx et l'identifiant fourni par le prestataire. Sinon `failed` avec nouvelle tentative, ou `dead` après le nombre maximal de tentatives. Chaque tentative est tracée dans `notification_attempts` (table immuable).
5. Le code de remise n'est jamais placé dans `notification_outbox.payload` : le code en clair n'est retourné qu'une fois à l'expéditeur, qui doit le transmettre lui-même au destinataire tant qu'aucun canal officiel n'est validé.

## Variables d'environnement (côté serveur uniquement)

| Variable | Rôle |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Injectées par Supabase Edge Functions. Ne jamais les mettre dans le frontend ni dans Git. |
| `NOTIFICATION_WORKER_SECRET` | Secret d'appel du worker (en-tête `x-worker-secret`). À générer côté Render/Supabase, hors dépôt. |
| `NOTIFICATION_EMAIL_ENDPOINT`, `NOTIFICATION_EMAIL_TOKEN` | Prestataire e-mail à choisir après vérification contractuelle et tarifaire. |
| `WHATSAPP_API_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANGUAGE` | Compte WhatsApp Business Platform / Cloud API officiel et template validé par Meta. |

## Activation contrôlée

1. Choisir le prestataire après validation de ses conditions, de la protection des données et des coûts par le propriétaire du projet.
2. Configurer les secrets dans l'environnement serveur, jamais dans ce dépôt.
3. Déclarer le canal via `admin_set_provider_config` (action administrateur auditée). Les lignes `blocked` correspondantes repassent alors `pending`.
4. Déployer la fonction en préproduction, puis exécuter des tests avec des comptes fictifs et un provider sandbox.
5. Vérifier `notification_outbox`, `notification_attempts` et `audit_logs` avant toute ouverture commerciale.

## Ce qui reste explicitement bloqué

- Choix et contractualisation d'un prestataire e-mail.
- Compte WhatsApp Business officiel, validation du template et autorisation d'envoi.
- Planification (cron) et supervision du worker.
- Tests d'envoi réel en préproduction.

Tant que ces points ne sont pas validés, l'application affiche « aucun envoi externe n'a eu lieu » et ne prétend jamais qu'un message a été envoyé.
