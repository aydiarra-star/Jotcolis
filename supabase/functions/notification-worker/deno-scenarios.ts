// Tests Deno locaux du worker : aucun déploiement, aucun accès réseau autorisé,
// aucun prestataire réel. fetch, Deno.env et les journaux sont simulés.
import {
  createWorkerHandler,
  emailSecretsPresent,
  whatsappSecretsPresent,
  type ClaimedNotification,
  type WorkerEnv,
} from "./index.ts";

type EnvValues = Record<string, string | undefined>;
type TestLogger = {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
};
type MockOptions = {
  rows?: ClaimedNotification[];
  claimOnce?: boolean;
  providerStatus?: number;
  providerBody?: unknown;
  providerHeaders?: Record<string, string>;
  providerThrow?: unknown;
  recordStatus?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${message} : attendu ${b}, obtenu ${a}`);
}

function assertIncludes(value: unknown, needle: string, message: string): void {
  assert(String(value).includes(needle), `${message} : « ${needle} » absent`);
}

function assertNotIncludes(value: unknown, needle: string, message: string): void {
  assert(!String(value).includes(needle), `${message} : « ${needle} » présent`);
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function makeEnv(overrides: EnvValues = {}): WorkerEnv {
  const values: EnvValues = {
    NOTIFICATION_WORKER_SECRET: "local-worker-secret",
    SUPABASE_URL: "https://rzezmtahqrxiivdjfajo.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "local-service-role-key",
    NOTIFICATION_EMAIL_ENDPOINT: "https://mail.example.test/send",
    NOTIFICATION_EMAIL_TOKEN: "local-email-token",
    WHATSAPP_API_VERSION: "v21.0",
    WHATSAPP_PHONE_NUMBER_ID: "123456789",
    WHATSAPP_ACCESS_TOKEN: "local-whatsapp-token",
    WHATSAPP_TEMPLATE_NAME: "jotcolis_test_template",
    WHATSAPP_TEMPLATE_LANGUAGE: "fr",
    ...overrides,
  };
  const map = new Map<string, string | undefined>(Object.entries(values));
  return { get: (name: string) => map.get(name) };
}

function makeLogger(): { logger: TestLogger; lines: string[] } {
  const lines: string[] = [];
  const push = (args: unknown[]) => lines.push(args.map(String).join(" "));
  return {
    lines,
    logger: { log: (...args: unknown[]) => push(args), error: (...args: unknown[]) => push(args) },
  };
}

function makeRequest(action = "deliver", workerSecret = "local-worker-secret"): Request {
  return new Request("https://worker.example.test/", {
    method: "POST",
    headers: {
      "x-worker-secret": workerSecret,
      "x-worker-action": action,
    },
  });
}

function makeRow(overrides: Partial<ClaimedNotification> = {}): ClaimedNotification {
  const base: ClaimedNotification = {
    id: "11111111-1111-4111-8111-111111111111",
    event_key: "phase-final-email-000001",
    event_type: "test_notification",
    channel: "email",
    recipient_contact: "expediteur@example.test",
    payload: {
      label: "Test local",
      instruction: "Aucun envoi réel",
      parcel_code: "JC-TEST-0001",
    },
    status: "claimed",
    claim_token: "22222222-2222-4222-8222-222222222222",
    attempt_no: 1,
    claim_expires_at: new Date(Date.now() + 120000).toISOString(),
  };
  return { ...base, ...overrides };
}

function makeWhatsAppRow(overrides: Partial<ClaimedNotification> = {}): ClaimedNotification {
  return makeRow({
    id: "33333333-3333-4333-8333-333333333333",
    event_key: "phase-final-whatsapp-000001",
    channel: "whatsapp",
    recipient_contact: "+221770000000",
    claim_token: "44444444-4444-4444-8444-444444444444",
    ...overrides,
  });
}

function parseBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== "string") return {};
  try {
    return JSON.parse(init.body) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function makeMockFetch(options: MockOptions = {}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const recordBodies: Record<string, unknown>[] = [];
  const secretBodies: Record<string, unknown>[] = [];
  let claimCount = 0;
  let providerCalls = 0;

  const fetchImpl = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    await Promise.resolve();
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input.url;
    const body = parseBody(init);
    calls.push({ url, body });

    if (url.includes("/rest/v1/rpc/claim_notifications")) {
      claimCount += 1;
      const rows = options.claimOnce
        ? claimCount === 1 ? (options.rows ?? []) : []
        : (options.rows ?? []);
      return jsonResponse(rows);
    }
    if (url.includes("/rest/v1/rpc/record_notification_result")) {
      recordBodies.push(body);
      if (options.recordStatus && options.recordStatus >= 400) {
        return new Response("conflit local", { status: options.recordStatus });
      }
      return jsonResponse({});
    }
    if (url.includes("/rest/v1/rpc/report_provider_secret_check")) {
      secretBodies.push(body);
      return jsonResponse({});
    }
    if (url.includes("mail.example.test") || url.includes("graph.facebook.com")) {
      providerCalls += 1;
      if (options.providerThrow !== undefined) throw options.providerThrow;
      return new Response(JSON.stringify(options.providerBody ?? {}), {
        status: options.providerStatus ?? 200,
        headers: options.providerHeaders ?? {},
      });
    }
    return new Response("Appel inattendu", { status: 500 });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    recordBodies,
    secretBodies,
    get claimCount() { return claimCount; },
    get providerCalls() { return providerCalls; },
  };
}

async function run(
  env: WorkerEnv,
  mock: ReturnType<typeof makeMockFetch>,
  request: Request = makeRequest(),
) {
  const logging = makeLogger();
  const handler = createWorkerHandler(env, mock.fetchImpl, logging.logger);
  const response = await handler(request);
  return { response, logging };
}

Deno.test("secret absent ou invalide : 401/503 et aucun appel externe", async () => {
  const noSecret = makeMockFetch();
  const unauthorized = await run(makeEnv({ NOTIFICATION_WORKER_SECRET: undefined }), noSecret);
  assertEqual(unauthorized.response.status, 401, "Secret worker absent");
  assertEqual(noSecret.providerCalls, 0, "Aucun appel prestataire");

  const badSupabase = makeMockFetch();
  const unavailable = await run(makeEnv({ SUPABASE_URL: undefined }), badSupabase);
  assertEqual(unavailable.response.status, 503, "URL Supabase absente");
  assertEqual(badSupabase.providerCalls, 0, "Aucun appel prestataire");

  const badMethod = await run(makeEnv(), noSecret, new Request("https://worker.example.test/", { method: "GET" }));
  assertEqual(badMethod.response.status, 405, "Méthode GET refusée");
});

Deno.test("secret-check : absence de secrets, aucun appel prestataire, booléens uniquement", async () => {
  const env = makeEnv({
    NOTIFICATION_EMAIL_ENDPOINT: undefined,
    NOTIFICATION_EMAIL_TOKEN: undefined,
    WHATSAPP_PHONE_NUMBER_ID: undefined,
    WHATSAPP_ACCESS_TOKEN: undefined,
    WHATSAPP_TEMPLATE_NAME: undefined,
  });
  const mock = makeMockFetch();
  const { response, logging } = await run(env, mock, makeRequest("secret-check"));
  assertEqual(response.status, 200, "secret-check réussi");
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.emailSecretsPresent, false, "Secrets e-mail absents");
  assertEqual(body.whatsappSecretsPresent, false, "Secrets WhatsApp absents");
  assertEqual(mock.secretBodies.length, 2, "Deux rapports d'état");
  assertEqual(mock.providerCalls, 0, "Aucun appel prestataire");
  assertNotIncludes(logging.lines.join("\n"), "local-service-role-key", "Aucun secret dans les journaux");
});

Deno.test("secrets invalides : endpoint HTTP, version WhatsApp injectée et configuration refusée", async () => {
  const env = makeEnv({
    NOTIFICATION_EMAIL_ENDPOINT: "http://mail.example.test/send",
    WHATSAPP_API_VERSION: "../bad",
  });
  assertEqual(emailSecretsPresent(env), false, "Endpoint e-mail non HTTPS refusé");
  assertEqual(whatsappSecretsPresent(env), false, "Version WhatsApp invalide refusée");

  const emailMock = makeMockFetch({ rows: [makeRow()] });
  const emailRun = await run(env, emailMock);
  assertEqual(emailRun.response.status, 200, "Livraison contrôlée");
  assertEqual(emailMock.providerCalls, 0, "Aucun appel vers endpoint invalide");
  assertEqual(emailMock.recordBodies[0].p_error_code, "INVALID_EMAIL_ENDPOINT", "Erreur e-mail explicite");

  const whatsappMock = makeMockFetch({ rows: [makeWhatsAppRow()] });
  await run(env, whatsappMock);
  assertEqual(whatsappMock.providerCalls, 0, "Aucun appel Graph API avec version invalide");
  assertEqual(whatsappMock.recordBodies[0].p_error_code, "INVALID_WHATSAPP_CONFIG", "Erreur WhatsApp explicite");
});

Deno.test("prestataire absent : livraison externe bloquée sans appel réseau", async () => {
  const env = makeEnv({
    NOTIFICATION_EMAIL_ENDPOINT: undefined,
    NOTIFICATION_EMAIL_TOKEN: undefined,
  });
  const mock = makeMockFetch({ rows: [makeRow()] });
  const { response } = await run(env, mock);
  assertEqual(response.status, 200, "Réponse contrôlée");
  assertEqual(mock.providerCalls, 0, "Aucun appel prestataire");
  assertEqual(mock.recordBodies[0].p_status, "blocked", "Statut bloqué");
  assertEqual(mock.recordBodies[0].p_error_code, "EMAIL_PROVIDER_NOT_CONFIGURED", "Motif explicite");
});

Deno.test("prestataire indisponible : exception réseau bloquée pour réconciliation", async () => {
  const mock = makeMockFetch({ rows: [makeRow()], providerThrow: new Error("réseau local indisponible") });
  const { response } = await run(makeEnv(), mock);
  assertEqual(response.status, 200, "Réponse contrôlée");
  assertEqual(mock.providerCalls, 1, "Une tentative locale simulée");
  assertEqual(mock.recordBodies[0].p_status, "blocked", "Pas de faux succès");
  assertEqual(mock.recordBodies[0].p_error_code, "DELIVERY_TIMEOUT_MANUAL_RECONCILIATION", "Résultat ambigu");
});

Deno.test("timeout : DOMException bloquée, sans retry automatique", async () => {
  const mock = makeMockFetch({
    rows: [makeRow()],
    providerThrow: new DOMException("timeout local", "TimeoutError"),
  });
  const { response } = await run(makeEnv(), mock);
  assertEqual(response.status, 200, "Réponse contrôlée");
  assertEqual(mock.providerCalls, 1, "Une tentative locale simulée");
  assertEqual(mock.recordBodies[0].p_error_code, "DELIVERY_TIMEOUT_MANUAL_RECONCILIATION", "Timeout ambigu");
});

Deno.test("réponse HTTP non 2xx : échec explicite, jamais sent", async () => {
  const mock = makeMockFetch({ rows: [makeRow()], providerStatus: 503 });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.failed, 1, "Un échec");
  assertEqual(body.sent, 0, "Aucun succès");
  assertEqual(mock.recordBodies[0].p_status, "failed", "Statut failed");
  assertEqual(mock.recordBodies[0].p_error_code, "EMAIL_HTTP_503", "Code HTTP explicite");
});

Deno.test("2xx sans identifiant de message : confirmation manquante et statut bloqué", async () => {
  const mock = makeMockFetch({ rows: [makeRow()], providerStatus: 200, providerBody: {} });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.sent, 0, "Aucun faux succès");
  assertEqual(body.blocked, 1, "Ligne bloquée");
  assertEqual(mock.recordBodies[0].p_error_code, "EMAIL_PROVIDER_CONFIRMATION_MISSING", "Confirmation exigée");
});

Deno.test("confirmation prestataire : 2xx + identifiant donnent un seul sent", async () => {
  const mock = makeMockFetch({
    rows: [makeRow()],
    providerStatus: 200,
    providerBody: { id: "msg-local-confirmed-0001" },
    providerHeaders: { "x-message-id": "msg-local-confirmed-0001" },
  });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.sent, 1, "Un succès confirmé");
  assertEqual(mock.recordBodies[0].p_status, "sent", "Statut sent");
  assertEqual(mock.recordBodies[0].p_provider_message_id, "msg-local-confirmed-0001", "Identifiant prestataire");
});

Deno.test("claim expiré : aucun appel prestataire et blocage avant livraison", async () => {
  const expired = makeRow({ claim_expires_at: new Date(Date.now() - 1000).toISOString() });
  const mock = makeMockFetch({ rows: [expired] });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.blocked, 1, "Ligne bloquée");
  assertEqual(mock.providerCalls, 0, "Aucun appel prestataire");
  assertEqual(mock.recordBodies[0].p_error_code, "CLAIM_EXPIRED_BEFORE_DELIVERY", "Claim expiré");
});

Deno.test("payload invalide : champs non whitelistés rejetés avant tout envoi", async () => {
  const invalid = makeRow({ payload: { nested: { secret: true } } as unknown as Record<string, unknown> });
  const mock = makeMockFetch({ rows: [invalid] });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.blocked, 1, "Ligne bloquée");
  assertEqual(mock.providerCalls, 0, "Aucun appel prestataire");
  assertEqual(mock.recordBodies[0].p_error_code, "INVALID_NOTIFICATION_PAYLOAD", "Payload refusé");
});

Deno.test("message déjà traité : conflit PostgREST sans faux succès", async () => {
  const mock = makeMockFetch({
    rows: [makeRow()],
    recordStatus: 409,
    providerHeaders: { "x-message-id": "msg-local-once-0001" },
  });
  const { response, logging } = await run(makeEnv(), mock);
  assertEqual(response.status, 500, "Erreur interne contrôlée");
  assertEqual(mock.recordBodies.length, 1, "Un seul résultat tenté");
  assertIncludes(logging.lines.join("\n"), "POSTGREST_RECORD_NOTIFICATION_RESULT_HTTP_409", "Code d'erreur sûr journalisé");
  assertNotIncludes(logging.lines.join("\n"), "expediteur@example.test", "Aucun contact journalisé");
});

Deno.test("tentative de double envoi dans un lot : event_key dédupliqué", async () => {
  const row1 = makeRow();
  const row2 = makeRow({
    id: "55555555-5555-4555-8555-555555555555",
    claim_token: "66666666-6666-4666-8666-666666666666",
  });
  const mock = makeMockFetch({
    rows: [row1, row2],
    providerHeaders: { "x-message-id": "msg-local-dedupe-0001" },
  });
  const { response } = await run(makeEnv(), mock);
  const body = await response.json() as Record<string, unknown>;
  assertEqual(body.sent, 1, "Un seul succès");
  assertEqual(body.blocked, 1, "Doublon bloqué");
  assertEqual(mock.providerCalls, 1, "Un seul appel prestataire");
  assertEqual(mock.recordBodies[1].p_error_code, "DUPLICATE_EVENT_IN_BATCH", "Doublon explicite");
});

Deno.test("deux workers concurrents simulés : un seul claim et un seul appel prestataire", async () => {
  const mock = makeMockFetch({
    rows: [makeRow()],
    claimOnce: true,
    providerHeaders: { "x-message-id": "msg-local-concurrent-0001" },
  });
  const logging = makeLogger();
  const handler = createWorkerHandler(makeEnv(), mock.fetchImpl, logging.logger);
  const responses = await Promise.all([
    handler(makeRequest()),
    handler(makeRequest()),
  ]);
  assertEqual(responses.every((r) => r.status === 200), true, "Deux réponses contrôlées");
  assertEqual(mock.claimCount, 2, "Deux appels de claim simulés");
  assertEqual(mock.providerCalls, 1, "Un seul appel prestataire");
  const bodies = await Promise.all(responses.map((r) => r.json())) as Record<string, unknown>[];
  assertEqual(bodies.map((b) => b.claimed).sort(), [0, 1], "Un lot revendiqué, l'autre vide");
});

Deno.test("journaux : aucun contact, secret, jeton ou identifiant prestataire", async () => {
  const mock = makeMockFetch({
    rows: [makeRow()],
    providerHeaders: { "x-message-id": "msg-local-private-0001" },
  });
  const { logging } = await run(makeEnv(), mock);
  const logs = logging.lines.join("\n");
  for (const forbidden of [
    "expediteur@example.test",
    "local-email-token",
    "local-service-role-key",
    "local-worker-secret",
    "msg-local-private-0001",
    "JC-TEST-0001",
  ]) {
    assertNotIncludes(logs, forbidden, "Journal sans donnée sensible");
  }
});
