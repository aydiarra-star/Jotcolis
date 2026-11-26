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

type ClaimedNotification = {
  id: string;
  event_key: string;
  event_type: string;
  channel: "email" | "whatsapp";
  recipient_contact: string | null;
  payload: Record<string, unknown> | null;
  status: string;
  claim_token: string;
  attempt_no: number;
  claim_expires_at?: string;
};

type DeliveryResult = {
  status: "sent" | "failed" | "blocked";
  provider?: string;
  providerMessageId?: string | null;
  httpStatus?: number;
  errorCode?: string | null;
};

const jsonHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
});

function oneLine(value: unknown, maxLength: number): string {
  return (typeof value === "string" ? value : "")
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

function safeWorkerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (/^POSTGREST_[A-Z0-9_]+_HTTP_[0-9]{3}$/.test(message)) return message;
  return "WORKER_INTERNAL_ERROR";
}

async function postgrest(
  supabaseUrl: string,
  serviceRoleKey: string,
  rpc: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpc}`, {
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
      return typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : null;
    }
    const messages = parsed.messages;
    if (!Array.isArray(messages)) return null;
    const value = (messages[0] as Record<string, unknown> | undefined)?.id;
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,200}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

function emailSecretsPresent(): boolean {
  return Boolean(Deno.env.get("NOTIFICATION_EMAIL_ENDPOINT")) &&
    Boolean(Deno.env.get("NOTIFICATION_EMAIL_TOKEN"));
}

function whatsappSecretsPresent(): boolean {
  return Boolean(Deno.env.get("WHATSAPP_PHONE_NUMBER_ID")) &&
    Boolean(Deno.env.get("WHATSAPP_ACCESS_TOKEN")) &&
    Boolean(Deno.env.get("WHATSAPP_TEMPLATE_NAME"));
}

async function deliverEmail(row: ClaimedNotification): Promise<DeliveryResult> {
  const endpoint = Deno.env.get("NOTIFICATION_EMAIL_ENDPOINT");
  const token = Deno.env.get("NOTIFICATION_EMAIL_TOKEN");
  if (!endpoint || !token || !row.recipient_contact) {
    return { status: "blocked", errorCode: "EMAIL_PROVIDER_NOT_CONFIGURED" };
  }
  const response = await fetch(endpoint, {
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
  const messageId = headerId && /^[A-Za-z0-9._:-]{1,200}$/.test(headerId)
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

async function deliverWhatsApp(row: ClaimedNotification): Promise<DeliveryResult> {
  // Intégration officielle uniquement : WhatsApp Cloud API (Meta Graph API).
  const version = Deno.env.get("WHATSAPP_API_VERSION") ?? "v21.0";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const token = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
  const templateName = Deno.env.get("WHATSAPP_TEMPLATE_NAME");
  const templateLanguage = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "fr";
  if (!phoneNumberId || !token || !templateName || !row.recipient_contact) {
    return { status: "blocked", errorCode: "WHATSAPP_PROVIDER_NOT_CONFIGURED" };
  }
  const to = row.recipient_contact.replace(/[^0-9]/g, "");
  if (to.length < 8) {
    return { status: "failed", errorCode: "WHATSAPP_INVALID_RECIPIENT" };
  }
  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
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

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const workerSecret = Deno.env.get("NOTIFICATION_WORKER_SECRET");
  const providedSecret = request.headers.get("x-worker-secret");
  if (!workerSecret || providedSecret !== workerSecret) {
    return new Response("Worker non autorisé", { status: 401 });
  }
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
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
        email: emailSecretsPresent(),
        whatsapp: whatsappSecretsPresent(),
      };
      for (const [channel, secretsPresent] of Object.entries(presence)) {
        await postgrest(supabaseUrl, serviceRoleKey, "report_provider_secret_check", {
          p_channel: channel,
          p_secrets_present: secretsPresent,
          p_error_code: null,
        });
      }
      const body = { action, emailSecretsPresent: presence.email, whatsappSecretsPresent: presence.whatsapp };
      console.log(JSON.stringify(body));
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const claimed = await postgrest(supabaseUrl, serviceRoleKey, "claim_notifications", {
      p_limit: 20,
      p_worker_id: "jotcolis-notification-worker",
    }) as ClaimedNotification[];
    const rows = Array.isArray(claimed) ? claimed : [];

    let sent = 0;
    let failed = 0;
    let blocked = 0;
    for (const row of rows) {
      let result: DeliveryResult;
      try {
        result = row.channel === "email"
          ? await deliverEmail(row)
          : await deliverWhatsApp(row);
      } catch {
        // Résultat réseau inconnu : ne pas réessayer automatiquement.
        result = { status: "blocked", errorCode: "DELIVERY_TIMEOUT_MANUAL_RECONCILIATION" };
      }
      if (result.status === "sent") sent += 1;
      else if (result.status === "failed") failed += 1;
      else blocked += 1;

      await postgrest(supabaseUrl, serviceRoleKey, "record_notification_result", {
        p_notification_id: row.id,
        p_claim_token: row.claim_token,
        p_status: result.status,
        p_provider: result.provider ?? null,
        p_provider_message_id: result.providerMessageId ?? null,
        p_http_status: result.httpStatus ?? null,
        p_error_code: result.errorCode ?? null,
      });
    }
    // Journal sans donnée personnelle ni secret.
    const body = { action, claimed: rows.length, sent, failed, blocked };
    console.log(JSON.stringify(body));
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notification_worker_error", safeWorkerErrorCode(error));
    return new Response("Erreur interne du worker", { status: 500 });
  }
});
