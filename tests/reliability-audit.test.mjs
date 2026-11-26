import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createTestDatabase,
  createUser,
  asUser,
  asService,
  callRpcNamed,
  callSetRpcNamed,
  expectError,
} from "./helpers/pglite-db.mjs";

const scopeValues = [
  "business_model", "transport_rules", "customs", "airline",
  "insurance", "privacy", "terms",
];

function futureIso(days = 14) {
  return new Date(Date.now() + days * 86400000).toISOString();
}

function requestArgs(tripId, weight, key, description = "Livres et vêtements") {
  return {
    p_trip_id: tripId,
    p_description: description,
    p_declared_content: description + " neufs, aucun objet réglementé",
    p_weight_kg: weight,
    p_recipient_name: "Destinataire Test",
    p_recipient_contact: "+221770000000",
    p_sender_contact: "+33600000000",
    p_terms_accepted: true,
    p_prohibited_confirmed: true,
    p_idempotency_key: key,
  };
}

async function completeProfile(db, uid, name) {
  return asUser(db, uid, () => callRpcNamed(db, "update_my_profile", {
    p_display_name: name,
    p_phone: "+33612345678",
    p_country_code: "FR",
    p_accept_terms: true,
    p_accept_privacy: true,
  }));
}

async function adminCall(db, adminId, name, args) {
  return asUser(db, adminId, () => callRpcNamed(db, name, args));
}

async function serviceCall(db, name, args) {
  return asService(db, () => callRpcNamed(db, name, args));
}

async function providerRow(db, channel) {
  return (await asService(db, () => db.query(
    "select * from public.notification_provider_states where channel = $1",
    [channel],
  ))).rows[0];
}

async function configValue(db, key) {
  return (await asService(db, () => db.query(
    "select value #>> '{}' as value from public.platform_config where key = $1",
    [key],
  ))).rows[0]?.value ?? null;
}

async function setupFixture() {
  const db = await createTestDatabase();
  const ids = {
    admin: randomUUID(),
    gp: randomUUID(),
    sender1: randomUUID(),
    sender2: randomUUID(),
  };
  for (const [name, id] of Object.entries(ids)) {
    await createUser(db, { id, email: `${name}@example.test`, confirmed: true, displayName: name });
    await completeProfile(db, id, `Utilisateur ${name}`);
  }
  await asService(db, () => db.query("select public.bootstrap_first_admin($1)", [ids.admin]));

  const corridor = (await asService(db, () => db.query(
    "select id from public.corridors where origin_country_code = 'FR' and destination_country_code = 'SN' order by created_at limit 1",
  ))).rows[0].id;

  for (const jurisdiction of ["FR", "SN"]) {
    for (const scope of scopeValues) {
      await adminCall(db, ids.admin, "admin_record_legal_validation", {
        p_jurisdiction: jurisdiction,
        p_scope: scope,
        p_professional_name: `Cabinet ${jurisdiction} ${scope}`,
        p_document_ref: `TEST-PHASE2-${jurisdiction}-${scope}-001`,
        p_notes: "Référence locale sans valeur juridique réelle",
      });
    }
  }
  const categories = (await asService(db, () => db.query("select code from public.prohibited_categories"))).rows;
  for (const category of categories) {
    await adminCall(db, ids.admin, "admin_validate_prohibited_category", {
      p_code: category.code,
      p_validation_reference: `TEST-PHASE2-CATEGORY-${category.code}-001`,
      p_reason: "Validation locale de test pour scénarios isolés",
    });
  }
  await adminCall(db, ids.admin, "admin_set_corridor_active", {
    p_corridor_id: corridor,
    p_active: true,
    p_legal_validation_ref: "TEST-PHASE2-CORRIDOR-FR-SN-001",
    p_reason: "Activation locale de test sans transport réel",
  });
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "legal_validation_complete",
    p_value: true,
    p_reason: "Validations locales de test complètes",
  });
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "pricing_config_validated",
    p_value: true,
    p_reason: "Grille locale de test validée",
  });
  // Ouverture commerciale de test SANS dépendance à un prestataire payant.
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "commercial_open",
    p_value: true,
    p_reason: "Ouverture locale de test sans notifications externes",
  });
  // Déclaration administrative : ne doit pas activer le canal.
  await adminCall(db, ids.admin, "admin_set_provider_config", {
    p_channel: "email",
    p_configured: true,
    p_provider_name: "Prestataire déclaré de test",
    p_reason: "Déclaration locale de test sans secret ni envoi",
  });

  const gpSubmission = `${ids.gp}/identity-${randomUUID()}.pdf`;
  await asUser(db, ids.gp, () => callRpcNamed(db, "submit_gp_verification", {
    p_legal_first_name: "Moussa",
    p_legal_last_name: "Diallo",
    p_phone: "+33612345678",
    p_travel_departure_at: futureIso(21),
    p_travel_destination: "Dakar",
    p_travel_capacity_kg: 20,
    p_identity_doc_path: gpSubmission,
    p_idempotency_key: "phase2-gp-submission-000001",
    p_accept_terms: true,
  }));
  await adminCall(db, ids.admin, "admin_review_gp", {
    p_user_id: ids.gp,
    p_decision: "approved",
    p_note: "Contrôles locaux de test par l administrateur",
    p_identity_status: "checked",
    p_contact_status: "checked",
    p_travel_status: "checked",
    p_documents_status: "checked",
    p_expires_at: futureIso(365),
  });

  const tripId = await asUser(db, ids.gp, () => callRpcNamed(db, "create_trip_draft", {
    p_corridor_id: corridor,
    p_origin_city: "Paris",
    p_destination_city: "Dakar",
    p_departure_at: futureIso(14),
    p_capacity_kg: 20,
    p_currency: "EUR",
    p_price_per_kg: 10,
    p_conditions: "Remise en main propre uniquement",
  }));
  await asUser(db, ids.gp, () => callRpcNamed(db, "publish_my_trip", { p_trip_id: tripId }));
  const draftTripId = await asUser(db, ids.gp, () => callRpcNamed(db, "create_trip_draft", {
    p_corridor_id: corridor,
    p_origin_city: "Lyon",
    p_destination_city: "Dakar",
    p_departure_at: futureIso(20),
    p_capacity_kg: 15,
    p_currency: "EUR",
    p_price_per_kg: 10,
    p_conditions: "Brouillon non publié de test",
  }));

  const code1 = await asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 12, "phase2-request-sender1-000001")));
  const code2 = await asUser(db, ids.sender2, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 9, "phase2-request-sender2-000001", "Documents personnels")));
  const request1 = (await asService(db, () => db.query("select * from public.parcel_requests where parcel_code = $1", [code1]))).rows[0];
  const request2 = (await asService(db, () => db.query("select * from public.parcel_requests where parcel_code = $1", [code2]))).rows[0];

  await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
    p_request_id: request2.id,
    p_accept: false,
    p_note: "Refus local de test",
  }));
  const booking1 = await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
    p_request_id: request1.id,
    p_accept: true,
    p_note: null,
  }));
  await asUser(db, ids.sender1, () => callRpcNamed(db, "confirm_booking", { p_booking_id: booking1 }));

  return { db, ids, corridor, tripId, draftTripId, code1, code2, request1, request2, booking1 };
}

let fixture;
before(async () => { fixture = await setupFixture(); });
after(async () => { if (fixture) await fixture.db.close(); });
const serial = { concurrency: false };

describe("Audit Phase 2 — scénarios PostgreSQL locaux isolés", serial, () => {
  test("utilisateur non connecté : RPC publiques uniquement, tables sensibles et service_role interdits", serial, async () => {
    const { db, ids, code1 } = fixture;
    await expectError(
      asUser(db, null, () => db.query("select public.get_my_state()"), "anon"),
      "permission denied",
    );
    await expectError(
      asUser(db, null, () => db.query("select * from public.platform_config"), "anon"),
      "permission denied",
    );
    const trips = await asUser(db, null, () => callSetRpcNamed(db, "search_trips", {
      p_origin: "Paris", p_destination: "Dakar", p_date: null, p_min_capacity: null,
    }), "anon");
    assert.equal(trips.length, 1);
    const passport = await asUser(db, null, () => callSetRpcNamed(db, "get_parcel_passport", {
      p_parcel_code: code1,
    }), "anon");
    assert.ok(passport.length > 0);
    await expectError(
      asUser(db, ids.sender1, () => db.query("select * from public.platform_config")),
      "permission denied",
    );
    await expectError(
      asUser(db, ids.sender1, () => db.query("select * from public.notification_provider_states")),
      "permission denied",
    );
    await expectError(
      asUser(db, ids.sender1, () => db.query("select public.report_provider_secret_check('email', true, null)")),
      "permission denied",
    );
    await expectError(
      asUser(db, ids.sender1, () => db.query("select * from public.claim_notifications(1, 'intrus')")),
      "permission denied",
    );
    const grants = (await asService(db, () => db.query(`
      select proname, has_function_privilege('service_role', p.oid, 'EXECUTE') as ok
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and proname in
        ('bootstrap_first_admin','claim_notifications','record_notification_result',
         'report_provider_secret_check','report_provider_error',
         'record_provider_test_result','mark_provider_operational')
    `))).rows;
    assert.ok(grants.length >= 7);
    assert.ok(grants.every((row) => row.ok === true));
    const publicExecute = (await asService(db, () => db.query(`
      select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('public', p.oid, 'EXECUTE')
    `))).rows[0].n;
    assert.equal(publicExecute, 0);
  });

  test("déclaration admin : aucun booléen n'active les notifications et aucune dépendance payante n'est requise", serial, async () => {
    const { db, ids } = fixture;
    assert.equal(await configValue(db, "commercial_open"), "true");
    assert.equal(await configValue(db, "notifications_enabled"), "false");
    const initial = await providerRow(db, "email");
    assert.equal(initial.declared_active, true);
    assert.equal(initial.server_state, "non_configure");
    assert.equal(initial.secrets_present, false);
    await expectError(
      adminCall(db, ids.admin, "admin_set_platform_flag", {
        p_key: "notifications_enabled",
        p_value: true,
        p_reason: "Tentative d activation directe interdite",
      }),
      "NOTIFICATION_ACTIVATION_SERVER_ONLY",
    );
    await adminCall(db, ids.admin, "admin_set_provider_config", {
      p_channel: "email",
      p_configured: false,
      p_provider_name: "Prestataire retiré de test",
      p_reason: "Retrait local de la déclaration de test",
    });
    let row = await providerRow(db, "email");
    assert.equal(row.declared_active, false);
    assert.equal(row.server_state, "non_configure");
    await adminCall(db, ids.admin, "admin_set_provider_config", {
      p_channel: "email",
      p_configured: true,
      p_provider_name: "Prestataire déclaré de test",
      p_reason: "Nouvelle déclaration locale sans activation",
    });
    row = await providerRow(db, "email");
    assert.equal(row.declared_active, true);
    assert.equal(row.server_state, "non_configure");
    assert.equal(await configValue(db, "notifications_enabled"), "false");
    await expectError(
      adminCall(db, ids.admin, "admin_set_provider_config", {
        p_channel: "email",
        p_configured: true,
        p_provider_name: "Bearer abcdefghijklmnopqrstuvwxyz012345",
        p_reason: "Tentative de collage de jeton interdite",
      }),
      "PROVIDER_SECRET_FORBIDDEN",
    );
  });

  test("états prestataires : non configuré, configuré, testé, opérationnel, en erreur, puis récupération", serial, async () => {
    const { db } = fixture;
    await serviceCall(db, "report_provider_secret_check", {
      p_channel: "email", p_secrets_present: true, p_error_code: null,
    });
    assert.equal((await providerRow(db, "email")).server_state, "configure");
    assert.equal(await configValue(db, "notifications_enabled"), "false");

    await serviceCall(db, "record_provider_test_result", {
      p_channel: "email", p_provider_message_id: null, p_http_status: 200, p_error_code: null,
    });
    assert.equal((await providerRow(db, "email")).server_state, "en_erreur");
    await serviceCall(db, "report_provider_secret_check", {
      p_channel: "email", p_secrets_present: true, p_error_code: null,
    });
    assert.equal((await providerRow(db, "email")).server_state, "configure");

    await serviceCall(db, "record_provider_test_result", {
      p_channel: "email", p_provider_message_id: "phase2-provider-msg-0001", p_http_status: 202, p_error_code: null,
    });
    assert.equal((await providerRow(db, "email")).server_state, "teste");
    assert.equal(await configValue(db, "notifications_enabled"), "false");

    await expectError(
      serviceCall(db, "mark_provider_operational", {
        p_channel: "whatsapp", p_reason: "Activation WhatsApp non testée interdite",
      }),
      "PROVIDER_TEST_REQUIRED",
    );
    await serviceCall(db, "mark_provider_operational", {
      p_channel: "email", p_reason: "Activation locale après confirmation prestataire de test",
    });
    const row = await providerRow(db, "email");
    assert.equal(row.server_state, "operationnel");
    assert.ok(row.operational_at);
    assert.equal(await configValue(db, "notifications_enabled"), "true");
    assert.equal(await configValue(db, "email_provider_configured"), "true");
    assert.equal(await configValue(db, "email_provider_state"), "operationnel");

    const pendingEmail = (await asService(db, () => db.query(
      "select count(*)::int n from public.notification_outbox where channel = 'email' and status = 'pending'",
    ))).rows[0].n;
    const blockedWhatsapp = (await asService(db, () => db.query(
      "select count(*)::int n from public.notification_outbox where channel = 'whatsapp' and status = 'blocked'",
    ))).rows[0].n;
    assert.ok(pendingEmail > 0, "Les lignes e-mail bloquées avant test sont réactivées par l'état serveur opérationnel");
    assert.ok(blockedWhatsapp > 0, "WhatsApp non opérationnel reste bloqué");

    await serviceCall(db, "report_provider_error", { p_channel: "email", p_error_code: "PROVIDER_LOCAL_ERROR" });
    assert.equal((await providerRow(db, "email")).server_state, "en_erreur");
    assert.equal(await configValue(db, "notifications_enabled"), "false");
    await serviceCall(db, "report_provider_secret_check", {
      p_channel: "email", p_secrets_present: true, p_error_code: null,
    });
    await serviceCall(db, "record_provider_test_result", {
      p_channel: "email", p_provider_message_id: "phase2-provider-msg-0002", p_http_status: 200, p_error_code: null,
    });
    await serviceCall(db, "mark_provider_operational", {
      p_channel: "email", p_reason: "Rétablissement local après erreur simulée",
    });
    assert.equal((await providerRow(db, "email")).server_state, "operationnel");
  });

  test("rôles : propriétaire, gestionnaire/admin, transporteur GP et utilisateur connecté non autorisé", serial, async () => {
    const { db, ids, tripId, draftTripId, booking1 } = fixture;
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "publish_my_trip", { p_trip_id: draftTripId })),
      "GP_APPROVAL_REQUIRED",
    );
    const published = (await asService(db, () => db.query("select status from public.trips where id = $1", [draftTripId]))).rows[0].status;
    assert.equal(published, "draft", "Un utilisateur non propriétaire ne publie pas le brouillon");
    const freshCode = await asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request",
      requestArgs(tripId, 2, "phase2-role-request-000001", "Livres pour test de rôle")));
    const freshRequest = (await asService(db, () => db.query(
      "select id from public.parcel_requests where parcel_code = $1",
      [freshCode],
    ))).rows[0];
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "respond_to_request", {
        p_request_id: freshRequest.id, p_accept: true, p_note: null,
      })),
      "NOT_TRIP_OWNER",
    );
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "admin_overview", {})),
      "ADMIN_REQUIRED",
    );
    await expectError(
      adminCall(db, ids.admin, "admin_review_gp", {
        p_user_id: ids.admin,
        p_decision: "approved",
        p_note: "Tentative d auto-approbation interdite",
        p_identity_status: "checked",
        p_contact_status: "checked",
        p_travel_status: "checked",
        p_documents_status: "checked",
        p_expires_at: futureIso(365),
      }),
      "SELF_APPROVAL_FORBIDDEN",
    );
    const overview = await adminCall(db, ids.admin, "admin_overview", {});
    assert.ok(Array.isArray(overview.notification_provider_states));
    assert.ok(overview.notification_provider_states.every((row) => !("last_provider_message_id" in row)));
    assert.ok(!JSON.stringify(overview.platform_config).includes("delivery_code_ttl_hours"));

    const eventId = await asUser(db, ids.gp, () => callRpcNamed(db, "advance_booking", {
      p_booking_id: booking1, p_event_type: "parcel_received", p_note: null,
    }));
    assert.ok(eventId);
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "advance_booking", {
        p_booking_id: booking1, p_event_type: "departure_reported", p_note: null,
      })),
      "NOT_BOOKING_GP",
    );
  });

  test("deux utilisateurs, refus de réservation, trajet non publié et historique incomplet sans doublon", serial, async () => {
    const { db, ids, tripId, draftTripId, code2, request2, code1 } = fixture;
    const otherRequests = await asUser(db, ids.sender1, () => db.query(
      "select count(*)::int n from public.parcel_requests where sender_id = $1",
      [ids.sender2],
    ));
    assert.equal(otherRequests.rows[0].n, 0);
    const otherBookings = await asUser(db, ids.sender2, () => db.query(
      "select count(*)::int n from public.bookings where sender_id = $1",
      [ids.sender1],
    ));
    assert.equal(otherBookings.rows[0].n, 0);
    assert.equal(request2.status, "awaiting_gp"); // instantané de création, avant décision serveur
    const refused = (await asService(db, () => db.query("select status, decided_at from public.parcel_requests where id = $1", [request2.id]))).rows[0];
    assert.equal(refused.status, "rejected");
    assert.ok(refused.decided_at);
    const refusedBookings = (await asService(db, () => db.query("select count(*)::int n from public.bookings where parcel_request_id = $1", [request2.id]))).rows[0].n;
    assert.equal(refusedBookings, 0);
    const capacity = Number((await asService(db, () => db.query("select capacity_remaining_kg from public.trips where id = $1", [tripId]))).rows[0].capacity_remaining_kg);
    assert.equal(capacity, 8, "Le refus ne réserve aucune capacité, l'acceptation de 12 kg sur 20 kg en laisse 8");

    const trips = await asUser(db, null, () => callSetRpcNamed(db, "search_trips", {
      p_origin: null, p_destination: null, p_date: null, p_min_capacity: null,
    }), "anon");
    assert.ok(!trips.some((trip) => trip.id === draftTripId));
    assert.ok(trips.every((trip) => trip.gp_verification_status === "approved"));
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(draftTripId, 2, "phase2-draft-request-000001"))),
      "TRIP_NOT_AVAILABLE",
    );

    const requestHistory = await asUser(db, null, () => callSetRpcNamed(db, "get_parcel_passport", {
      p_parcel_code: code2,
    }), "anon");
    assert.equal(requestHistory.length, 1, "Une demande refusée ne doit pas dupliquer son historique public");
    assert.equal(requestHistory[0].current_status, "rejected");
    assert.equal(new Set(requestHistory.map((row) => row.sequence_no)).size, requestHistory.length);
    const bookingHistory = await asUser(db, null, () => callSetRpcNamed(db, "get_parcel_passport", {
      p_parcel_code: code1,
    }), "anon");
    assert.equal(new Set(bookingHistory.map((row) => row.sequence_no)).size, bookingHistory.length);
    assert.ok(!Object.keys(bookingHistory[0]).some((key) => /recipient|phone|email|identity|code_hash|code_salt/i.test(key)));
  });

  test("notifications : bloquée, échec explicite, confirmation prestataire, double envoi et claim expiré", serial, async () => {
    const { db } = fixture;
    const blocked = (await asService(db, () => db.query(
      "select status, last_error from public.notification_outbox where channel = 'whatsapp' and status = 'blocked' limit 1",
    ))).rows[0];
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.last_error, "NOTIFICATIONS_DISABLED");

    const claimed = await asService(db, () => callSetRpcNamed(db, "claim_notifications", {
      p_limit: 4, p_worker_id: "phase2-local-worker",
    }));
    assert.ok(claimed.length >= 4);
    assert.ok(claimed.every((row) => row.channel === "email" && row.status === "claimed" && row.claim_token && row.claim_expires_at));

    const first = claimed[0];
    await expectError(
      asService(db, () => callRpcNamed(db, "record_notification_result", {
        p_notification_id: first.id,
        p_claim_token: first.claim_token,
        p_status: "sent",
        p_provider: "email",
        p_provider_message_id: null,
        p_http_status: 200,
        p_error_code: null,
      })),
      "PROVIDER_CONFIRMATION_REQUIRED",
    );
    await asService(db, () => callRpcNamed(db, "record_notification_result", {
      p_notification_id: first.id,
      p_claim_token: first.claim_token,
      p_status: "sent",
      p_provider: "email",
      p_provider_message_id: "phase2-provider-msg-sent-0001",
      p_http_status: 200,
      p_error_code: null,
    }));
    const sent = (await asService(db, () => db.query("select status, sent_at, provider_message_id from public.notification_outbox where id = $1", [first.id]))).rows[0];
    assert.equal(sent.status, "sent");
    assert.ok(sent.sent_at);
    assert.equal(sent.provider_message_id, "phase2-provider-msg-sent-0001");
    await expectError(
      asService(db, () => callRpcNamed(db, "record_notification_result", {
        p_notification_id: first.id,
        p_claim_token: first.claim_token,
        p_status: "sent",
        p_provider: "email",
        p_provider_message_id: "phase2-provider-msg-sent-0002",
        p_http_status: 200,
        p_error_code: null,
      })),
      "NOTIFICATION_CLAIM_MISMATCH",
    );

    const second = claimed[1];
    await asService(db, () => callRpcNamed(db, "record_notification_result", {
      p_notification_id: second.id,
      p_claim_token: second.claim_token,
      p_status: "failed",
      p_provider: "email",
      p_provider_message_id: null,
      p_http_status: 503,
      p_error_code: "EMAIL_HTTP_503",
    }));
    const failed = (await asService(db, () => db.query("select status, next_attempt_at, last_error from public.notification_outbox where id = $1", [second.id]))).rows[0];
    assert.equal(failed.status, "failed");
    assert.equal(failed.last_error, "EMAIL_HTTP_503");
    assert.ok(failed.next_attempt_at);

    const third = claimed[2];
    await asService(db, () => callRpcNamed(db, "record_notification_result", {
      p_notification_id: third.id,
      p_claim_token: third.claim_token,
      p_status: "blocked",
      p_provider: "email",
      p_provider_message_id: null,
      p_http_status: 200,
      p_error_code: "EMAIL_PROVIDER_CONFIRMATION_MISSING",
    }));
    const ambiguous = (await asService(db, () => db.query("select status, last_error from public.notification_outbox where id = $1", [third.id]))).rows[0];
    assert.equal(ambiguous.status, "blocked");
    assert.equal(ambiguous.last_error, "EMAIL_PROVIDER_CONFIRMATION_MISSING");
    assert.equal((await providerRow(db, "email")).server_state, "en_erreur");

    // Un bail expiré n'est jamais réessayé automatiquement : réconciliation manuelle.
    const fourth = claimed[3];
    await asService(db, () => db.query(
      "update public.notification_outbox set claim_expires_at = now() - interval '1 minute' where id = $1",
      [fourth.id],
    ));
    const reclaimed = await asService(db, () => callSetRpcNamed(db, "claim_notifications", {
      p_limit: 20, p_worker_id: "phase2-local-worker-2",
    }));
    assert.ok(!reclaimed.some((row) => row.id === fourth.id));
    const expired = (await asService(db, () => db.query("select status, last_error from public.notification_outbox where id = $1", [fourth.id]))).rows[0];
    assert.equal(expired.status, "blocked");
    assert.equal(expired.last_error, "CLAIM_TIMEOUT_MANUAL_RECONCILIATION");
    assert.equal(await configValue(db, "notifications_enabled"), "false");
  });

  test("worker : secret-check sans appel prestataire, aucun payload brut, aucun secret dans les journaux", serial, async () => {
    const source = await readFile(new URL("../supabase/functions/notification-worker/index.ts", import.meta.url), "utf8");
    assert.match(source, /x-worker-action/);
    assert.match(source, /secret-check/);
    assert.match(source, /report_provider_secret_check/);
    assert.match(source, /Idempotency-Key/);
    assert.match(source, /PROVIDER_CONFIRMATION_MISSING/);
    assert.match(source, /DELIVERY_TIMEOUT_MANUAL_RECONCILIATION/);
    assert.match(source, /notification_channel_is_operational/);
    assert.match(source, /createWorkerHandler/);
    assert.match(source, /CLAIM_EXPIRED_BEFORE_DELIVERY/);
    assert.match(source, /INVALID_NOTIFICATION_PAYLOAD/);
    assert.doesNotMatch(source, /payload:\s*row\.payload/);
    assert.doesNotMatch(source, /console\.(log|error)\([^)]*Deno\.env/);
    assert.doesNotMatch(source, /console\.(log|error)\([^)]*recipient_contact/);
    assert.doesNotMatch(source, /sb_secret_|sk_live_/i);
  });

  test("isolation multi-utilisateurs : profils, demandes, réservations, passeport, notifications, codes, incidents, documents et audit", serial, async () => {
    const { db, ids, tripId, booking1 } = fixture;
    const sender2Code = await asUser(db, ids.sender2, () => callRpcNamed(db, "submit_parcel_request",
      requestArgs(tripId, 2, "phase-final-isolation-request-000001", "Livres pour test isolement")));
    const sender2Request = (await asService(db, () => db.query(
      "select id from public.parcel_requests where parcel_code = $1", [sender2Code],
    ))).rows[0];
    const booking2 = await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
      p_request_id: sender2Request.id, p_accept: true, p_note: null,
    }));

    await asService(db, () => db.query(`
      insert into public.gp_verifications (user_id) values ($1) on conflict do nothing
    `, [ids.sender2]));
    await asService(db, () => db.query(`
      insert into public.verification_documents (user_id, kind, storage_path)
      values ($1, 'identity', 'phase-final/sender1-identity.pdf'),
             ($2, 'identity', 'phase-final/sender2-identity.pdf')
      on conflict do nothing
    `, [ids.sender1, ids.sender2]));
    await asService(db, () => db.query(`
      insert into public.trip_alerts (user_id, origin_city, destination_city, contact)
      values ($1, 'Paris', 'Dakar', 'alerte-sender1@example.test'),
             ($2, 'Lyon', 'Dakar', 'alerte-sender2@example.test')
    `, [ids.sender1, ids.sender2]));
    await asService(db, () => db.query(`
      insert into public.notification_outbox
        (event_key, event_type, recipient_user_id, channel, payload, status)
      values
        ('phase-final-isolation-notification-sender1', 'test_isolation', $1, 'in_app', '{}'::jsonb, 'sent'),
        ('phase-final-isolation-notification-sender2', 'test_isolation', $2, 'in_app', '{}'::jsonb, 'sent')
      on conflict (event_key) do nothing
    `, [ids.sender1, ids.sender2]));
    await asService(db, () => db.query(`
      insert into public.delivery_codes
        (booking_id, parcel_code, code_salt, code_hash, expires_at)
      values
        ($1, 'JC-PHASE-FINALE-CODE-1', 'local-salt-1', 'local-hash-1', now() + interval '1 day'),
        ($2, 'JC-PHASE-FINALE-CODE-2', 'local-salt-2', 'local-hash-2', now() + interval '1 day')
      on conflict do nothing
    `, [booking1, booking2]));
    await asService(db, () => db.query(`
      insert into public.passport_events
        (booking_id, event_type, visible_to_sender, visible_to_gp, visible_to_public, parcel_code, payload)
      values ($1, 'booking_created', true, false, false, 'JC-PHASE-FINALE-PASSPORT-2', '{}'::jsonb)
    `, [booking2]));
    const incidentIds = (await asService(db, () => db.query(`
      insert into public.incidents (booking_id, opened_by, category, description, internal_reference)
      values
        ($1, $2, 'delay', 'Incident local isolement 1', 'INC-PHASE-FINALE-1'),
        ($3, $4, 'delay', 'Incident local isolement 2', 'INC-PHASE-FINALE-2')
      returning id, internal_reference
    `, [booking1, ids.sender1, booking2, ids.sender2]))).rows;
    const incident1 = incidentIds.find((row) => row.internal_reference === "INC-PHASE-FINALE-1").id;
    const incident2 = incidentIds.find((row) => row.internal_reference === "INC-PHASE-FINALE-2").id;
    await asService(db, () => db.query(`
      insert into public.incident_notes (incident_id, author_id, note, is_internal)
      values ($1, $2, 'Note visible isolement 1', false), ($3, $4, 'Note visible isolement 2', false)
    `, [incident1, ids.sender1, incident2, ids.sender2]));
    await asService(db, () => db.query(`
      insert into public.incident_evidence (incident_id, storage_path, uploaded_by)
      values ($1, 'phase-final/incident-sender1.pdf', $2), ($3, 'phase-final/incident-sender2.pdf', $4)
    `, [incident1, ids.sender1, incident2, ids.sender2]));

    const asSender1 = (sql, params = []) => asUser(db, ids.sender1, () => db.query(sql, params));
    assert.deepEqual((await asSender1("select id from public.profiles")).rows.map((r) => r.id), [ids.sender1]);
    assert.equal((await asSender1("select count(*)::int n from public.parcel_requests where sender_id = $1", [ids.sender2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.bookings where id = $1", [booking2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.passport_events where parcel_code = $1", ["JC-PHASE-FINALE-PASSPORT-2"])).rows[0].n, 0);
    const sender2Notification = (await asService(db, () => db.query(
      "select id from public.notification_outbox where event_key = $1",
      ["phase-final-isolation-notification-sender2"],
    ))).rows[0];
    const visibleNotifications = (await asSender1(
      "select id from public.my_notifications where event_type = $1", ["test_isolation"],
    )).rows;
    assert.equal(visibleNotifications.length, 1);
    assert.ok(!visibleNotifications.some((row) => row.id === sender2Notification.id));
    assert.equal((await asSender1("select count(*)::int n from public.delivery_code_status where booking_id = $1", [booking2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.verification_documents where user_id = $1", [ids.sender2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.trip_alerts where user_id = $1", [ids.sender2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.gp_verifications where user_id = $1", [ids.sender2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.incidents where id = $1", [incident2])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.incident_notes where note = $1", ["Note visible isolement 2"])).rows[0].n, 0);
    assert.equal((await asSender1("select count(*)::int n from public.incident_evidence where storage_path = $1", ["phase-final/incident-sender2.pdf"])).rows[0].n, 0);
    for (const table of ["audit_logs", "legal_validations"]) {
      assert.equal((await asSender1(`select count(*)::int n from public.${table}`)).rows[0].n, 0, `Fuite RLS admin sur ${table}`);
    }
    for (const table of ["notification_outbox", "notification_attempts", "delivery_codes", "notification_provider_states", "platform_config"]) {
      await expectError(asSender1(`select * from public.${table}`), "permission denied");
    }
  });

  test("double claim : deux appels successifs ne revendiquent jamais la même ligne (PGlite, sans concurrence réseau)", serial, async () => {
    const { db, ids } = fixture;
    await serviceCall(db, "report_provider_secret_check", {
      p_channel: "email", p_secrets_present: true, p_error_code: null,
    });
    await serviceCall(db, "record_provider_test_result", {
      p_channel: "email", p_provider_message_id: "phase-final-provider-msg-0001",
      p_http_status: 200, p_error_code: null,
    });
    await serviceCall(db, "mark_provider_operational", {
      p_channel: "email", p_reason: "Activation locale pour test de claim disjoint",
    });
    for (let index = 0; index < 3; index += 1) {
      await asService(db, () => callRpcNamed(db, "enqueue_notification", {
        p_event_key: `phase-final-claim-${index}`,
        p_event_type: "test_claim",
        p_recipient_user_id: ids.sender1,
        p_channel: "email",
        p_payload: { label: "Test local de claim", instruction: "Aucun envoi réel" },
        p_recipient_contact: "expediteur1@example.test",
      }));
    }
    const first = await asService(db, () => callSetRpcNamed(db, "claim_notifications", {
      p_limit: 100, p_worker_id: "phase-final-worker-a",
    }));
    const second = await asService(db, () => callSetRpcNamed(db, "claim_notifications", {
      p_limit: 100, p_worker_id: "phase-final-worker-b",
    }));
    assert.ok(first.length >= 3);
    assert.equal(second.length, 0, "Le second worker ne doit revendiquer aucune ligne déjà claimed");
    const firstIds = new Set(first.map((row) => row.id));
    assert.equal(firstIds.size, first.length);
    assert.ok(first.every((row) => row.claim_token && row.claim_expires_at && row.status === "claimed"));
  });

});
