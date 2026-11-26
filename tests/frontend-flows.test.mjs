import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { randomUUID } from "node:crypto";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const html = await read("../index.html");
const configJs = await read("../supabase-config.js");
const appJs = await read("../app.js");
const platformJs = await read("../platform.js");

const sampleTrip = {
  id: "11111111-1111-4111-8111-111111111111",
  origin_city: "Paris",
  destination_city: "Dakar",
  departure_at: "2027-01-15T10:00:00.000Z",
  capacity_remaining_kg: "12.00",
  currency: "EUR",
  price_per_kg: "10.00",
  conditions: "Remise en main propre",
  origin_label: "France",
  destination_label: "Sénégal",
  published_at: "2026-11-26T10:00:00.000Z",
  gp_verification_status: "approved",
};

const me = {
  user_id: "22222222-2222-4222-8222-222222222222",
  email: "expediteur@example.test",
  email_verified: true,
  is_admin: false,
  roles: ["sender"],
  profile: {
    id: "22222222-2222-4222-8222-222222222222",
    display_name: "Expéditeur Test",
    phone: "+33612345678",
    country_code: "FR",
    status: "active",
    gp_approved: false,
    profile_completed_at: "2026-11-20T10:00:00.000Z",
    terms_accepted_at: "2026-11-20T10:00:00.000Z",
    privacy_accepted_at: "2026-11-20T10:00:00.000Z",
  },
  gp_verification: null,
  config: {
    commercial_open: false,
    legal_validation_complete: false,
    notifications_enabled: false,
    email_provider_configured: false,
    whatsapp_provider_configured: false,
    email_provider_state: "non_configure",
    whatsapp_provider_state: "non_configure",
  },
  notification_provider_states: {
    email: { server_state: "non_configure", declared_active: false, secrets_present: false },
    whatsapp: { server_state: "non_configure", declared_active: false, secrets_present: false },
  },
  prohibited_categories_legally_validated: false,
};

function makeSession(overrides = {}) {
  return {
    user: {
      id: me.user_id,
      email: me.email,
      email_confirmed_at: "2026-11-20T10:00:00.000Z",
      ...overrides.user,
    },
    ...overrides.session,
  };
}

function createMockClient({ session = null, rpcHandlers = {}, tables = {}, errors = {} } = {}) {
  let currentSession = session;
  const calls = { rpc: [], auth: [], storage: [], tables: [] };

  const makeBuilder = (tableName) => {
    const builder = {};
    const resolveData = () => ({ data: tables[tableName] ?? [], error: errors[tableName] ?? null });
    builder.select = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.eq = () => builder;
    builder.gte = () => builder;
    builder.lte = () => builder;
    builder.single = () => Promise.resolve({ data: (tables[tableName] ?? [])[0] ?? null, error: null });
    builder.then = (resolve, reject) => Promise.resolve(resolveData()).then(resolve, reject);
    return builder;
  };

  const client = {
    from: (tableName) => {
      calls.tables.push(tableName);
      return makeBuilder(tableName);
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (errors[name]) return { data: null, error: errors[name] };
      const handler = rpcHandlers[name];
      const data = typeof handler === "function" ? await handler(args) : (handler ?? null);
      return { data, error: null };
    },
    auth: {
      getSession: async () => ({ data: { session: currentSession }, error: null }),
      onAuthStateChange: (callback) => {
        calls.auth.push({ action: "onAuthStateChange" });
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signOut: async () => {
        calls.auth.push({ action: "signOut" });
        currentSession = null;
        return { error: null };
      },
      signUp: async (payload) => {
        calls.auth.push({ action: "signUp", payload });
        return { data: { user: null, session: null }, error: null };
      },
      signInWithPassword: async (payload) => {
        calls.auth.push({ action: "signInWithPassword", payload });
        return { data: { user: null, session: null }, error: null };
      },
      resetPasswordForEmail: async (email, options) => {
        calls.auth.push({ action: "resetPasswordForEmail", email, options });
        return { data: {}, error: null };
      },
      resend: async (payload) => {
        calls.auth.push({ action: "resend", payload });
        return { data: {}, error: null };
      },
      updateUser: async (payload) => {
        calls.auth.push({ action: "updateUser", payload });
        return { data: { user: null }, error: null };
      },
    },
    storage: {
      from: (bucket) => ({
        upload: async (path, file, options) => {
          calls.storage.push({ bucket, path, options });
          return { data: { path }, error: null };
        },
      }),
    },
  };
  return { client, calls };
}

async function createEnvironment(options = {}) {
  const dom = new JSDOM(html, {
    url: "https://jotcolis.example.test/#accueil",
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  window.scrollTo = () => {};
  window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.HTMLElement.prototype.showPicker = () => {};
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: { randomUUID: () => randomUUID() },
  });

  const mock = createMockClient(options);
  window.supabase = { createClient: () => mock.client };
  window.eval(configJs);
  window.eval(appJs);
  window.eval(platformJs);
  await new Promise((resolve) => setTimeout(resolve, 60));
  return { dom, window, document: window.document, ...mock };
}

const flush = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

function submit(form, window) {
  form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
}

function setInput(document, name, value, form) {
  const field = (form || document).querySelector(`[name="${name}"]`);
  if (!field) throw new Error(`Champ introuvable : ${name}`);
  field.value = value;
  if (field.type === "checkbox") field.checked = Boolean(value);
  return field;
}

test("au chargement, aucun trajet fictif ni donnée locale n'est affiché", async () => {
  const env = await createEnvironment();
  const { document, window } = env;
  assert.equal(document.querySelectorAll("#trip-results .trip-card").length, 0);
  assert.match(document.querySelector("#trip-results").textContent, /Aucun trajet publié/);
  assert.doesNotMatch(document.body.textContent, /JC-EXEMPLE-2048|JC-4829|Données de démonstration/);
  assert.equal(window.localStorage.length, 0);
  assert.match(document.querySelector("#compliance-banner").textContent, /Service non ouvert au public/);
  env.dom.window.close();
});

test("la recherche appelle search_trips et n'affiche que les trajets retournés par le serveur", async () => {
  const env = await createEnvironment({
    rpcHandlers: { search_trips: () => [sampleTrip] },
  });
  const { document, window } = env;
  setInput(document, "origin", "Paris");
  setInput(document, "destination", "Dakar");
  submit(document.querySelector("#search-form"), window);
  await flush();
  assert.equal(document.querySelectorAll("#trip-results .trip-card").length, 1);
  assert.match(document.querySelector("#trip-results").textContent, /Trajet publié/);
  assert.match(document.querySelector("#search-feedback").textContent, /1 trajet\(s\) publié\(s\) trouvé\(s\) dans Supabase/);
  const call = env.calls.rpc.find((item) => item.name === "search_trips");
  assert.equal(call.args.p_origin, "Paris");
  assert.equal(call.args.p_destination, "Dakar");
  assert.equal(window.localStorage.length, 0);
  env.dom.window.close();
});

test("une erreur backend n'entraîne jamais l'affichage d'exemples fictifs", async () => {
  const env = await createEnvironment({
    errors: { search_trips: new Error("COMMERCIAL_OPERATIONS_DISABLED") },
  });
  const { document, window } = env;
  setInput(document, "origin", "Paris");
  setInput(document, "destination", "Dakar");
  submit(document.querySelector("#search-form"), window);
  await flush();
  assert.equal(document.querySelectorAll("#trip-results .trip-card").length, 0);
  assert.match(document.querySelector("#search-feedback").textContent, /Aucun exemple fictif/);
  assert.match(document.querySelector("#trip-results").textContent, /Aucun trajet publié/);
  env.dom.window.close();
});

test("le dépôt de demande exige une session vérifiée et écrit via submit_parcel_request", async () => {
  const env = await createEnvironment({
    session: makeSession(),
    rpcHandlers: {
      get_my_state: () => me,
      list_trip_corridors: () => [{ id: "33333333-3333-4333-8333-333333333333", origin_label: "Paris", destination_label: "Dakar", is_active: true }],
      search_trips: () => [sampleTrip],
      submit_parcel_request: () => "JC-2026-ABCDEF123456",
    },
  });
  const { document, window } = env;
  setInput(document, "origin", "Paris");
  setInput(document, "destination", "Dakar");
  submit(document.querySelector("#search-form"), window);
  await flush(80);
  const trigger = document.querySelector(".trip-contact-trigger");
  assert.ok(trigger);
  trigger.click();
  await flush(20);
  const modal = document.querySelector("#contact-gp-modal");
  assert.equal(modal.hidden, false);
  const form = document.querySelector("#contact-gp-form");
  setInput(document, "description", "Vêtements et livres", form);
  setInput(document, "declared_content", "Vêtements et livres neufs", form);
  setInput(document, "weight", "3", form);
  setInput(document, "sender_contact", "+33600000000", form);
  setInput(document, "recipient_name", "Fatou Test", form);
  setInput(document, "recipient_contact", "+221770000000", form);
  setInput(document, "terms", true, form);
  setInput(document, "prohibited", true, form);
  submit(form, window);
  await flush(60);
  const call = env.calls.rpc.find((item) => item.name === "submit_parcel_request");
  assert.ok(call);
  assert.equal(call.args.p_trip_id, sampleTrip.id);
  assert.equal(call.args.p_weight_kg, 3);
  assert.equal(call.args.p_terms_accepted, true);
  assert.match(call.args.p_idempotency_key, /^[0-9a-f-]{36}$/);
  assert.match(document.querySelector("#contact-gp-feedback").textContent, /Demande enregistrée dans Supabase/);
  assert.equal(document.querySelector("#contact-gp-submit").disabled, true);
  assert.equal(window.localStorage.length, 0);
  env.dom.window.close();
});

test("le suivi public affiche uniquement les événements retournés par get_parcel_passport", async () => {
  const events = [
    { parcel_code: "JC-2026-ABCDEF123456", current_status: "confirmed", label: "Demande créée", event_type: "request_created", occurred_at: "2026-11-26T10:00:00.000Z", sequence_no: "1", event_hash: "a".repeat(64) },
    { parcel_code: "JC-2026-ABCDEF123456", current_status: "confirmed", label: "Réservation confirmée", event_type: "booking_confirmed", occurred_at: "2026-11-26T11:00:00.000Z", sequence_no: "2", event_hash: "b".repeat(64) },
  ];
  const env = await createEnvironment({ rpcHandlers: { get_parcel_passport: () => events } });
  const { document, window } = env;
  const form = document.querySelector("#parcel-track-form");
  setInput(document, "parcel_code", "JC-2026-ABCDEF123456", form);
  submit(form, window);
  await flush();
  assert.equal(document.querySelectorAll("#parcel-track-results .timeline-event").length, 2);
  assert.match(document.querySelector("#parcel-track-feedback").textContent, /Statut actuel : Confirmée/);
  assert.doesNotMatch(document.querySelector("#parcel-track-results").textContent, /Exemple|JC-4829/);
  env.dom.window.close();
});

test("mot de passe oublié : la demande est transmise à Supabase Auth sans fausse confirmation d'envoi", async () => {
  const env = await createEnvironment();
  const { document, window } = env;
  document.querySelector('[data-action="forgot-password"]').click();
  await flush(10);
  const form = document.querySelector("#forgot-password-form");
  assert.equal(form.hidden, false);
  setInput(document, "email", "compte@example.test", form);
  submit(form, window);
  await flush(30);
  const call = env.calls.auth.find((item) => item.action === "resetPasswordForEmail");
  assert.ok(call);
  assert.equal(call.email, "compte@example.test");
  assert.match(document.querySelector("#auth-status").textContent, /Aucun envoi n’est confirmé ici/);
  env.dom.window.close();
});

test("inscription et déconnexion utilisent Supabase Auth et masquent les parcours privés", async () => {
  const env = await createEnvironment({ session: makeSession(), rpcHandlers: { get_my_state: () => me } });
  const { document, window } = env;
  assert.equal(document.querySelector("#account-session").hidden, false);
  assert.equal(document.querySelector("#signin-form").hidden, true);
  assert.match(document.querySelector("#dashboard-root").textContent, /Mon compte/);
  document.querySelector('[data-action="signout"]').click();
  await flush(30);
  assert.ok(env.calls.auth.some((item) => item.action === "signOut"));
  assert.equal(document.querySelector("#account-session").hidden, true);
  assert.equal(document.querySelector("#signin-form").hidden, false);
  assert.equal(document.querySelector("#dashboard-shell").hidden, true);
  env.dom.window.close();
});

test("compte non confirmé : l'interface indique le blocage et refuse d'ouvrir une demande", async () => {
  const env = await createEnvironment({
    session: makeSession({ user: { email_confirmed_at: null } }),
    rpcHandlers: {
      get_my_state: () => ({ ...me, email_verified: false }),
      search_trips: () => [sampleTrip],
    },
  });
  const { document, window } = env;
  setInput(document, "origin", "Paris");
  setInput(document, "destination", "Dakar");
  submit(document.querySelector("#search-form"), window);
  await flush(80);
  const trigger = document.querySelector(".trip-contact-trigger");
  trigger.click();
  await flush(20);
  assert.equal(document.querySelector("#contact-gp-modal").hidden, true);
  assert.match(document.querySelector("#auth-status").textContent, /Confirmez votre adresse e-mail/);
  assert.equal(env.calls.rpc.some((item) => item.name === "submit_parcel_request"), false);
  env.dom.window.close();
});


test("utilisateur non connecté : aucun état privé, aucune lecture directe de platform_config", async () => {
  const env = await createEnvironment();
  const { document, calls } = env;
  assert.equal(document.querySelector("#dashboard-shell").hidden, true);
  assert.match(document.querySelector("#dashboard-root").textContent, /Connectez-vous/);
  assert.ok(!calls.rpc.some((call) => call.name === "get_my_state"));
  assert.ok(!calls.tables.includes("platform_config"));
  assert.ok(!document.querySelector('[data-tab="admin"]'));
});

test("utilisateur connecté sans rôle admin : aucun onglet administration ni RPC admin", async () => {
  const env = await createEnvironment({
    session: makeSession(),
    rpcHandlers: { get_my_state: () => me },
  });
  const { document, calls } = env;
  await flush();
  assert.ok(calls.rpc.some((call) => call.name === "get_my_state"));
  assert.ok(!calls.rpc.some((call) => call.name === "admin_overview"));
  assert.ok(!document.querySelector('[data-tab="admin"]'));
  assert.ok(!calls.tables.includes("platform_config"));
});

test("administrateur : états serveur visibles, déclaration sans activation automatique", async () => {
  const adminMe = {
    ...me,
    is_admin: true,
    roles: ["sender", "admin"],
  };
  const adminOverview = {
    counts: { profiles: 4, pending_gp: 0, trips: 1, requests: 1, bookings: 1, open_incidents: 0, blocked_notifications: 2 },
    profiles: [], gp_verifications: [], corridors: [], trips: [], incidents: [], bookings: [],
    categories: [], legal_validations: [], audit_logs: [], notifications: [],
    notification_provider_states: [
      { channel: "email", declared_provider_name: "Prestataire de test", declared_active: true, server_state: "non_configure", secrets_present: false, last_error: "SERVER_SECRETS_MISSING" },
      { channel: "whatsapp", declared_provider_name: null, declared_active: false, server_state: "non_configure", secrets_present: false, last_error: "SERVER_SECRETS_MISSING" },
    ],
    platform_config: {
      commercial_open: false, notifications_enabled: false,
      email_provider_state: "non_configure", whatsapp_provider_state: "non_configure",
    },
    prohibited_categories: [],
  };
  const env = await createEnvironment({
    session: makeSession(),
    rpcHandlers: {
      get_my_state: () => adminMe,
      admin_overview: () => adminOverview,
      admin_set_provider_config: () => null,
    },
  });
  const { document, window, calls } = env;
  await flush();
  const adminTab = document.querySelector('[data-tab="admin"]');
  assert.ok(adminTab);
  adminTab.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  await flush();
  assert.match(document.querySelector("#dashboard-root").textContent, /Non configuré/);
  assert.match(document.querySelector("#dashboard-root").textContent, /Déclaration administrative/);
  assert.doesNotMatch(document.querySelector("#dashboard-root").innerHTML, /<option value="notifications_enabled">/);
  assert.ok(!calls.tables.includes("platform_config"));

  const form = document.querySelector('form[data-form="admin-provider-config"]');
  assert.ok(form);
  setInput(document, "provider", "Prestataire déclaré de test", form);
  setInput(document, "reason", "Déclaration locale sans secret ni activation", form);
  const configured = setInput(document, "configured", true, form);
  configured.checked = true;
  submit(form, window);
  await flush();
  const providerCall = calls.rpc.find((call) => call.name === "admin_set_provider_config");
  assert.ok(providerCall);
  assert.equal(providerCall.args.p_channel, "email");
  assert.equal(providerCall.args.p_configured, true);
  assert.doesNotMatch(JSON.stringify(providerCall.args), /sb_secret|service_role|Bearer/i);
  assert.match(document.querySelector("#dashboard-feedback").textContent, /Aucun canal n’a été activé/);
});
