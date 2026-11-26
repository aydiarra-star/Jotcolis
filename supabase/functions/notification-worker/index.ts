// JotColis — worker de notifications (Edge Function, NON DÉPLOYÉE).
//
// Règles absolues :
// - Aucun secret n'est stocké dans le dépôt : tout vient de Deno.env.
// - Aucun message n'est marqué "sent" sans réponse HTTP 2xx ET identifiant prestataire.
// - WhatsApp utilise exclusivement l'API Cloud officielle Meta (template approuvé).
// - claim_notifications ne revendique que les canaux validés par
//   notification_channel_is_operational côté base.
// - Si un canal n'est pas opérationnel côté serveur, la ligne reste bloquée.
// - Un timeout est ambigu : il est bloqué pour réconciliation manuelle, jamais réessayé.
// - Les journaux ne contiennent ni adresse, ni numéro, ni code, ni jeton, ni réponse prestataire.
// - Les secrets sont lus via Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") et les variables serveur ;
//   createWorkerHandler reçoit une interface d'environnement pour permettre des tests locaux
//   sans déployer la fonction ni autoriser le moindre accès réseau.
//
// Aucun mode automatique de test d'envoi n'est exposé : aucun appel prestataire,
// aucun test payant, aucun coût et aucune activation dans l'action secret-check.

export type ClaimedNotification = {
  id: string;
  event_key: string;
  event_type: string;
  channel: "email" | "whatsapp";
  recipient_contact: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  claim_token: string;
  attempt_no: number;
  claim_expires_at?: string | null;
};

type DeliveryResult = {
  status: "sent" | "failed" | "blocked";
  provider?: string;
  providerMessageId?: string | null;
  httpStatus?: number;
  errorCode?: string | null;
};

export type WorkerEnv = {
  get(name: string): string | undefined;
};

type WorkerLogger = {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_KEY_RE = /^[A-Za-z0-9._:-]{3,200}$/;
const EVENT_TYPE_RE = /^[A-Za-z0-9_]{3,120}$/;
const MESSAGE_ID_RE = /^[A-Za-z0-9._:-]{1,200}$/;
const ERROR_CODE_RE = /^[A-Za-z0-9_]{1,120}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const API_VERSION_RE = /^v[0-9]+\.[0-9]+$/;
const PHONE_ID_RE = /^[0-9]{5,30}$/;
const TEMPLATE_NAME_RE = /^[A-Za-z0-9_]{2,120}$/;
const LANGUAGE_RE = /^[A-Za-z0-9_-]{2,20}$/;
const SAFE_PAYLOAD_KEYS = new Set(["label", "instruction", "parcel_code"]);

function jsonHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function controlFree(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    output += code <= 31 || code === 127 ? " " : character;
  }
  return output;
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

function oneLine(value: unknown, maxLength: number): string {
  return controlFree(typeof value === "string" ? value : "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeText(row: ClaimedNotification): string {
  const payload = row.payload ?? {};
  const label = oneLine(payload.label, 120) || oneLine(row.event_type, 120);
  const instruction = oneLine(payload.instruction, 500);
  const parcelCode = oneLine(payload.parcel_code, 80).replace(/[^A-Za-z0-9_-]/g, "");
  return [
    `JotColis — ${label}`,
    parcelCode ? `Référence colis : ${parcelCode}` : "",
    instruction,
    "Cette information ne contient aucun code de remise. Consultez votre espace JotColis pour la suite.",
  ].filter(Boolean).join("\n");
}

function safeEventKey(eventKey: string): string {
  return eventKey.replace(/[^A-Za-z0-9._:-]/g, "_").slice(0, 200);
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.length > 0 &&
      url.username === "" && url.password === "" &&
      url.hostname !== "localhost" && !url.hostname.endsWith(".local");
  } catch {
    return false;
  }
}

function isSafeToken(value: string): boolean {
  return value.length >= 8 && value.length <= 500 && !/\s/.test(value);
}

function safeWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^POSTGREST_[A-Z0-9_]+_HTTP_[0-9]{3}$/.test(message)) return message;
  return "WORKER_INTERNAL_ERROR";
}

async function postgrest(
  env: WorkerEnv,
  fetchImpl: typeof fetch,
  rpc: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const supabaseUrl = (env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const response = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: jsonHeaders(serviceRoleKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    throw new Error(`POSTGREST_${rpc.toUpperCase()}_HTTP_${response.status}`);
  }
  const raw = await response.text();
  if (!raw) return null;
  return JSON.parse(raw);
}

function providerMessageId(raw: string, channel: "email" | "whatsapp"): string | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (channel === "email") {
      const value = parsed.id ?? parsed.message_id;
      return typeof value === "string" && MESSAGE_ID_RE.test(value) ? value : null;
    }
    const messages = parsed.messages;
    if (!Array.isArray(messages)) return null;
    const value = (messages[0] as Record<string, unknown> | undefined)?.id;
    return typeof value === "string" && MESSAGE_ID_RE.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function emailSecretsPresent(env: WorkerEnv): boolean {
  const endpoint = env.get("NOTIFICATION_EMAIL_ENDPOINT");
  const token = env.get("NOTIFICATION_EMAIL_TOKEN");
  return Boolean(endpoint && token && isHttpsUrl(endpoint) && isSafeToken(token));
}

export function whatsappSecretsPresent(env: WorkerEnv): boolean {
  const version = env.get("WHATSAPP_API_VERSION") ?? "v21.0";
  const phoneNumberId = env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "fr";
  return API_VERSION_RE.test(version) &&
    Boolean(phoneNumberId && PHONE_ID_RE.test(phoneNumberId)) &&
    Boolean(token && isSafeToken(token)) &&
    Boolean(templateName && TEMPLATE_NAME_RE.test(templateName)) &&
    LANGUAGE_RE.test(templateLanguage);
}

function isSafePayload(payload: unknown): boolean {
  if (payload == null) return true;
  if (typeof payload !== "object" || Array.isArray(payload)) return false;
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!SAFE_PAYLOAD_KEYS.has(key)) return false;
    if (value != null && typeof value !== "string") return false;
    if (typeof value === "string") {
      if (value.length > 1000 || hasControlCharacter(value)) return false;
      if (key === "parcel_code" && value && !/^[A-Za-z0-9_-]{1,80}$/.test(value)) return false;
    }
  }
  return true;
}

export function validateClaimedNotification(row: unknown): string | null {
  if (!row || typeof row !== "object" || Array.isArray(row)) return "INVALID_NOTIFICATION_PAYLOAD";
  const value = row as Partial<ClaimedNotification>;
  if (typeof value.id !== "string" || !UUID_RE.test(value.id)) return "INVALID_NOTIFICATION_ID";
  if (typeof value.event_key !== "string" || !EVENT_KEY_RE.test(value.event_key)) return "INVALID_EVENT_KEY";
  if (typeof value.event_type !== "string" || !EVENT_TYPE_RE.test(value.event_type)) return "INVALID_EVENT_TYPE";
  if (value.channel !== "email" && value.channel !== "whatsapp") return "INVALID_NOTIFICATION_CHANNEL";
  if (value.status !== "claimed") return "NOTIFICATION_NOT_CLAIMED";
  if (typeof value.claim_token !== "string" || !UUID_RE.test(value.claim_token)) return "NOTIFICATION_CLAIM_MISMATCH";
  if (!Number.isInteger(value.attempt_no) || (value.attempt_no ?? 0) < 1) return "INVALID_ATTEMPT_NUMBER";
  if (typeof value.recipient_contact !== "string" || value.recipient_contact.trim() === "") {
    return "RECIPIENT_CONTACT_MISSING";
  }
  if (value.channel === "email" && !EMAIL_RE.test(value.recipient_contact)) return "INVALID_RECIPIENT_CONTACT";
  if (value.channel === "whatsapp" && value.recipient_contact.replace(/[^0-9]/g, "").length < 8) {
    return "INVALID_RECIPIENT_CONTACT";
  }
  if (!isSafePayload(value.payload)) return "INVALID_NOTIFICATION_PAYLOAD";
  if (value.claim_expires_at) {
    const expiry = Date.parse(value.claim_expires_at);
    if (!Number.isFinite(expiry)) return "INVALID_CLAIM_EXPIRY";
    if (expiry <= Date.now()) return "CLAIM_EXPIRED_BEFORE_DELIVERY";
  }
  return null;
}

async function deliverEmail(
  row: ClaimedNotification,
  env: WorkerEnv,
  fetchImpl: typeof fetch,
): Promise<DeliveryResult> {
  const endpoint = env.get("NOTIFICATION_EMAIL_ENDPOINT");
  const token = env.get("NOTIFICATION_EMAIL_TOKEN");
  if (!endpoint || !token || !row.recipient_contact) {
    return { status: "blocked", errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }
  if (!isHttpsUrl(endpoint) || !isSafeToken(token)) {
    return { status: "blocked", errorCode: "INVALID_EMAIL_ENDPOINT" };
  }
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": safeEventKey(row.event_key),
    },
    body: JSON.stringify({
      to: row.recipient_contact,
      subject: `JotColis — ${oneLine(row.event_type, 100)}`,
      text: safeText(row),
      event_type: row.event_type,
      event_key: row.event_key,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) {
    return { status: "failed", httpStatus: response.status, errorCode: `EMAIL_HTTP_${response.status}` };
  }
  const headerId = response.headers.get("x-message-id");
  const messageId = headerId && MESSAGE_ID_RE.test(headerId)
    ? headerId
    : providerMessageId(raw, "email");
  if (!messageId) {
    return {
      status: "blocked",
      httpStatus: response.status,
      errorCode: "EMAIL_PROVIDER_CONFIRMATION_MISSING",
    };
  }
  return { status: "sent", provider: "email", providerMessageId: messageId, httpStatus: response.status };
}

async function deliverWhatsApp(
  row: ClaimedNotification,
  env: WorkerEnv,
  fetchImpl: typeof fetch,
): Promise<DeliveryResult> {
  // Intégration officielle uniquement : WhatsApp Cloud API (Meta Graph API).
  const version = env.get("WHATSAPP_API_VERSION") ?? "v21.0";
  const phoneNumberId = env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "fr";
  if (!phoneNumberId || !token || !templateName || !row.recipient_contact) {
    return { status: "blocked", errorCode: "WHATSAPP_PROVIDER_NOT_CONFIGURED" };
  }
  if (!API_VERSION_RE.test(version) || !PHONE_ID_RE.test(phoneNumberId) ||
      !isSafeToken(token) || !TEMPLATE_NAME_RE.test(templateName) ||
      !LANGUAGE_RE.test(templateLanguage)) {
    return { status: "blocked", errorCode: "INVALID_WHATSAPP_CONFIG" };
  }
  const to = row.recipient_contact.replace(/[^0-9]/g, "");
  if (to.length < 8) {
    return { status: "failed", errorCode: "WHATSAPP_INVALID_RECIPIENT" };
  }
  const response = await fetchImpl(
    `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(phoneNumberId)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [{
            type: "body",
            parameters: [{ type: "text", text: safeText(row).slice(0, 900) }],
          }],
        },
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  const raw = await response.text();
  if (!response.ok) {
    return { status: "failed", httpStatus: response.status, errorCode: `WHATSAPP_HTTP_${response.status}` };
  }
  const messageId = providerMessageId(raw, "whatsapp");
  if (!messageId) {
    return {
      status: "blocked",
      httpStatus: response.status,
      errorCode: "WHATSAPP_PROVIDER_CONFIRMATION_MISSING",
    };
  }
  return {
    status: "sent",
    provider: "whatsapp-cloud-api",
    providerMessageId: messageId,
    httpStatus: response.status,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createWorkerHandler(
  env: WorkerEnv,
  fetchImpl: typeof fetch = fetch,
  logger: WorkerLogger = console,
): (request: Request) => Promise<Response> {
  return async function handler(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }
    const workerSecret = env.get("NOTIFICATION_WORKER_SECRET");
    const providedSecret = request.headers.get("x-worker-secret");
    if (!workerSecret || providedSecret !== workerSecret) {
      return new Response("Worker non autorisé", { status: 401 });
    }
    const supabaseUrl = env.get("SUPABASE_URL");
    const serviceRoleKey = env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey || !isHttpsUrl(supabaseUrl) || !isSafeToken(serviceRoleKey)) {
      return new Response("Configuration serveur absente", { status: 503 });
    }

    const action = request.headers.get("x-worker-action") ?? "deliver";
    if (action !== "deliver" && action !== "secret-check") {
      return new Response("Action inconnue", { status: 400 });
    }

    try {
      // Contrôle de présence des secrets uniquement : aucun appel prestataire,
      // aucun test payant, aucune activation automatique.
      if (action === "secret-check") {
        const presence = {
          email: emailSecretsPresent(env),
          whatsapp: whatsappSecretsPresent(env),
        };
        for (const [channel, secretsPresent] of Object.entries(presence)) {
          await postgrest(env, fetchImpl, "report_provider_secret_check", {
            p_channel: channel,
            p_secrets_present: secretsPresent,
            p_error_code: null,
          });
        }
        const body = { action, emailSecretsPresent: presence.email, whatsappSecretsPresent: presence.whatsapp };
        logger.log(JSON.stringify(body));
        return jsonResponse(body);
      }

      const claimed = await postgrest(env, fetchImpl, "claim_notifications", {
        p_limit: 20,
        p_worker_id: "jotcolis-notification-worker",
      }) as ClaimedNotification[];
      const rows = Array.isArray(claimed) ? claimed : [];

      let sent = 0;
      let failed = 0;
      let blocked = 0;
      const seenEventKeys = new Set<string>();
      for (const row of rows) {
        let result: DeliveryResult;
        const validationError = validateClaimedNotification(row);
        if (validationError) {
          result = { status: "blocked", errorCode: validationError };
        } else if (seenEventKeys.has(row.event_key)) {
          result = { status: "blocked", errorCode: "DUPLICATE_EVENT_IN_BATCH" };
        } else {
          seenEventKeys.add(row.event_key);
          try {
            result = row.channel === "email"
              ? await deliverEmail(row, env, fetchImpl)
              : await deliverWhatsApp(row, env, fetchImpl);
          } catch {
            // Résultat réseau inconnu : ne pas réessayer automatiquement.
            result = { status: "blocked", errorCode: "DELIVERY_TIMEOUT_MANUAL_RECONCILIATION" };
          }
        }
        if (result.status === "sent") sent += 1;
        else if (result.status === "failed") failed += 1;
        else blocked += 1;
        if (result.errorCode && !ERROR_CODE_RE.test(result.errorCode)) {
          throw new Error("WORKER_INTERNAL_ERROR");
        }

        try {
          await postgrest(env, fetchImpl, "record_notification_result", {
            p_notification_id: row.id,
            p_claim_token: row.claim_token,
            p_status: result.status,
            p_provider: result.provider ?? null,
            p_provider_message_id: result.providerMessageId ?? null,
            p_http_status: result.httpStatus ?? null,
            p_error_code: result.errorCode ?? null,
          });
        } catch (error) {
          logger.error("notification_result_error", safeWorkerErrorCode(error));
          return new Response("Erreur interne du worker", { status: 500 });
        }
      }
      // Journal sans donnée personnelle ni secret.
      const body = { action, claimed: rows.length, sent, failed, blocked };
      logger.log(JSON.stringify(body));
      return jsonResponse(body);
    } catch (error) {
      logger.error("notification_worker_error", safeWorkerErrorCode(error));
      return new Response("Erreur interne du worker", { status: 500 });
    }
  };
}

// Supabase Edge exécute ce fichier comme module principal. Les tests importent
// createWorkerHandler sans démarrer de serveur et sans autorisation réseau.
if (import.meta.main) {
  Deno.serve(createWorkerHandler(Deno.env, fetch, console));
}
