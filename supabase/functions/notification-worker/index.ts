// JotColis — worker de notifications (Edge Function, NON DÉPLOYÉE).
//
// Règles absolues :
// - Aucun secret n'est stocké dans le dépôt : tout vient de Deno.env.
// - Aucun message n'est marqué "sent" sans réponse HTTP 2xx d'un prestataire réel.
// - WhatsApp utilise exclusivement l'API Cloud officielle Meta (template approuvé).
// - Si un canal n'est pas configuré, la ligne reste "blocked" : aucun envoi n'est simulé.
// - Les journaux ne contiennent ni adresse, ni numéro, ni code, ni jeton.

type ClaimedNotification = {
  id: string;
  event_key: string;
  event_type: string;
  channel: "email" | "whatsapp";
  recipient_contact: string | null;
  payload: Record<string, unknown> | null;
  claim_token: string;
  attempt_no: number;
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

function safeText(row: ClaimedNotification): string {
  const payload = row.payload ?? {};
  const label = typeof payload.label === "string" ? payload.label : row.event_type;
  const instruction = typeof payload.instruction === "string" ? payload.instruction : "";
  const parcelCode = typeof payload.parcel_code === "string" ? payload.parcel_code : "";
  return [
    `JotColis — ${label}`,
    parcelCode ? `Référence colis : ${parcelCode}` : "",
    instruction,
    "Cette information ne contient aucun code de remise. Consultez votre espace JotColis pour la suite.",
  ].filter(Boolean).join("\n");
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
    throw new Error(`POSTGREST_${rpc}_HTTP_${response.status}`);
  }
  return response.json();
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
    },
    body: JSON.stringify({
      to: row.recipient_contact,
      subject: `JotColis — ${row.event_type}`,
      text: safeText(row),
      event_type: row.event_type,
      event_key: row.event_key,
      payload: row.payload ?? {},
    }),
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) {
    return { status: "failed", httpStatus: response.status, errorCode: `EMAIL_HTTP_${response.status}` };
  }
  let providerMessageId = response.headers.get("x-message-id");
  if (!providerMessageId) {
    try {
      const parsed = JSON.parse(raw) as { id?: string; message_id?: string };
      providerMessageId = parsed.id ?? parsed.message_id ?? null;
    } catch {
      providerMessageId = null;
    }
  }
  return { status: "sent", provider: "email", providerMessageId, httpStatus: response.status };
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
  let providerMessageId: string | null = null;
  try {
    const parsed = JSON.parse(raw) as { messages?: Array<{ id?: string }> };
    providerMessageId = parsed.messages?.[0]?.id ?? null;
  } catch {
    providerMessageId = null;
  }
  return { status: "sent", provider: "whatsapp-cloud-api", providerMessageId, httpStatus: response.status };
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

  try {
    const claimed = await postgrest(supabaseUrl, serviceRoleKey, "claim_notifications", {
      p_limit: 20,
      p_worker_id: "jotcolis-notification-worker",
    }) as ClaimedNotification[];

    let sent = 0;
    let failed = 0;
    let blocked = 0;
    for (const row of Array.isArray(claimed) ? claimed : []) {
      let result: DeliveryResult;
      try {
        result = row.channel === "email"
          ? await deliverEmail(row)
          : await deliverWhatsApp(row);
      } catch (error) {
        result = {
          status: "failed",
          errorCode: error instanceof Error ? error.message.slice(0, 120) : "DELIVERY_EXCEPTION",
        };
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
    // Journal sans donnée personnelle.
    console.log(JSON.stringify({ claimed: claimed.length, sent, failed, blocked }));
    return new Response(JSON.stringify({ claimed: claimed.length, sent, failed, blocked }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("notification_worker_error", error instanceof Error ? error.message : "unknown");
    return new Response("Erreur interne du worker", { status: 500 });
  }
});
