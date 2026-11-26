import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createTestDatabase,
  createUser,
  asUser,
  asService,
  callRpc,
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

function requestArgs(tripId, weight, key, description = "Vêtements et livres") {
  return {
    p_trip_id: tripId,
    p_description: description,
    p_declared_content: description + " neufs, aucun objet réglementé",
    p_weight_kg: weight,
    p_recipient_name: "Fatou Test",
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

async function setupPlatform() {
  const db = await createTestDatabase();
  const ids = {
    admin: randomUUID(),
    gp: randomUUID(),
    sender1: randomUUID(),
    sender2: randomUUID(),
    unconfirmed: randomUUID(),
  };
  for (const [name, id] of Object.entries(ids)) {
    await createUser(db, {
      id,
      email: `${name}@example.test`,
      confirmed: name !== "unconfirmed",
      displayName: name,
    });
    await completeProfile(db, id, `Utilisateur ${name}`);
  }

  await asService(db, () => db.query("select public.bootstrap_first_admin($1)", [ids.admin]));

  const corridor = (await asService(db, () => db.query(
    "select id from public.corridors where origin_country_code = 'FR' and destination_country_code = 'SN' order by created_at limit 1"
  ))).rows[0].id;

  for (const jurisdiction of ["FR", "SN"]) {
    for (const scope of scopeValues) {
      await adminCall(db, ids.admin, "admin_record_legal_validation", {
        p_jurisdiction: jurisdiction,
        p_scope: scope,
        p_professional_name: `Cabinet ${jurisdiction} ${scope}`,
        p_document_ref: `TEST-${jurisdiction}-${scope}-001`,
        p_notes: "Référence de test local, sans valeur juridique réelle",
      });
    }
  }
  const categories = (await asService(db, () => db.query("select code from public.prohibited_categories"))).rows;
  for (const category of categories) {
    await adminCall(db, ids.admin, "admin_validate_prohibited_category", {
      p_code: category.code,
      p_validation_reference: `TEST-CATEGORY-${category.code}-001`,
      p_reason: "Validation de test local uniquement",
    });
  }
  await adminCall(db, ids.admin, "admin_set_corridor_active", {
    p_corridor_id: corridor,
    p_active: true,
    p_legal_validation_ref: "TEST-CORRIDOR-FR-SN-001",
    p_reason: "Activation de test sur base locale isolée",
  });
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "legal_validation_complete",
    p_value: true,
    p_reason: "Validations de test présentes (sans valeur juridique réelle)",
  });
  await adminCall(db, ids.admin, "admin_set_provider_config", {
    p_channel: "email",
    p_configured: true,
    p_provider_name: "Provider local de test",
    p_reason: "Configuration de test sans secret ni envoi réel",
  });
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "pricing_config_validated",
    p_value: true,
    p_reason: "Grille de test validée localement",
  });
  await adminCall(db, ids.admin, "admin_set_platform_flag", {
    p_key: "commercial_open",
    p_value: true,
    p_reason: "Ouverture de test sur base locale isolée",
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
    p_idempotency_key: "gp-submission-integration-0001",
    p_accept_terms: true,
  }));
  await adminCall(db, ids.admin, "admin_review_gp", {
    p_user_id: ids.gp,
    p_decision: "approved",
    p_note: "Contrôles de test enregistrés par l administrateur",
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

  const code1 = await asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 12, "request-sender1-000001")));
  const code2 = await asUser(db, ids.sender2, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 9, "request-sender2-000001")));
  const request1 = (await asService(db, () => db.query("select * from public.parcel_requests where parcel_code = $1", [code1]))).rows[0];
  const request2 = (await asService(db, () => db.query("select * from public.parcel_requests where parcel_code = $1", [code2]))).rows[0];
  const booking1 = await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
    p_request_id: request1.id,
    p_accept: true,
    p_note: null,
  }));
  await asUser(db, ids.sender1, () => callRpcNamed(db, "confirm_booking", { p_booking_id: booking1 }));

  return { db, ids, corridor, tripId, code1, code2, request1, request2, booking1, gpSubmission };
}

let fixture;
before(async () => { fixture = await setupPlatform(); });
after(async () => { if (fixture) await fixture.db.close(); });

const serial = { concurrency: false };

describe("JotColis — intégration PostgreSQL locale (PGlite, données de test uniquement)", serial, () => {
  test("les migrations s'appliquent, RLS reste active et les privilèges PUBLIC sont retirés", serial, async () => {
    const { db, ids } = fixture;
    const tables = (await asService(db, () => db.query(
      "select relname, relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'"
    ))).rows;
    assert.ok(tables.length >= 20);
    assert.ok(tables.every((table) => table.relrowsecurity), "RLS doit être active sur toutes les tables public");

    const publicExecute = (await asService(db, () => db.query(`
      select count(*)::int as n
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and has_function_privilege('public', p.oid, 'EXECUTE')
    `))).rows[0].n;
    assert.equal(publicExecute, 0, "PostgreSQL accorde EXECUTE à PUBLIC par défaut : la révocation est obligatoire");

    assert.equal(await asUser(db, ids.admin, () => callRpc(db, "current_user_is_admin", [])), true);
    assert.equal(await asUser(db, ids.sender1, () => callRpc(db, "current_user_is_admin", [])), false);
    await expectError(
      asUser(db, ids.sender1, () => db.query("select public.bootstrap_first_admin($1)", [ids.sender1])),
      "permission denied"
    );
  });

  test("Auth : profil incomplet, e-mail non confirmé et rôles auto-attribués sont bloqués côté serveur", serial, async () => {
    const { db, ids, corridor } = fixture;
    const me = await asUser(db, ids.sender1, () => callRpc(db, "get_my_state", []));
    assert.equal(me.email_verified, true);
    assert.equal(me.is_admin, false);
    assert.ok(me.roles.includes("sender"));
    assert.equal(me.is_admin, false);

    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "request_role", { p_role: "admin" })),
      "ROLE_NOT_SELF_ASSIGNABLE"
    );
    await expectError(
      asUser(db, ids.unconfirmed, () => callRpcNamed(db, "create_trip_draft", {
        p_corridor_id: corridor,
        p_origin_city: "Paris",
        p_destination_city: "Dakar",
        p_departure_at: futureIso(20),
        p_capacity_kg: 5,
        p_currency: "EUR",
        p_price_per_kg: 10,
        p_conditions: null,
      })),
      "EMAIL_NOT_VERIFIED"
    );

    const unconfirmed = await asUser(db, ids.unconfirmed, () => callRpc(db, "get_my_state", []));
    assert.equal(unconfirmed.email_verified, false);

    await expectError(
      asUser(db, ids.sender1, () => db.query("update public.profiles set gp_approved = true where id = $1", [ids.sender1])),
      "permission denied"
    );
    await expectError(
      asUser(db, ids.sender1, () => db.query("insert into public.user_roles (user_id, role) values ($1, 'admin')", [ids.sender1])),
      "permission denied"
    );
  });

  test("Porte juridique : aucune publication ni demande réelle sans validations FR/SN documentées", serial, async () => {
    const db = await createTestDatabase();
    try {
      const admin = randomUUID();
      const gp = randomUUID();
      for (const [name, id] of Object.entries({ admin, gp })) {
        await createUser(db, { id, email: `${name}@example.test`, displayName: name });
        await completeProfile(db, id, `Utilisateur ${name}`);
      }
      await asService(db, () => db.query("select public.bootstrap_first_admin($1)", [admin]));
      const corridor = (await asService(db, () => db.query("select id from public.corridors limit 1"))).rows[0].id;
      const tripId = await asUser(db, gp, () => callRpcNamed(db, "create_trip_draft", {
        p_corridor_id: corridor,
        p_origin_city: "Paris",
        p_destination_city: "Dakar",
        p_departure_at: futureIso(14),
        p_capacity_kg: 10,
        p_currency: "EUR",
        p_price_per_kg: 10,
        p_conditions: null,
      }));
      await expectError(
        asUser(db, gp, () => callRpcNamed(db, "publish_my_trip", { p_trip_id: tripId })),
        "COMMERCIAL_OPERATIONS_DISABLED"
      );
      await expectError(
        adminCall(db, admin, "admin_set_platform_flag", {
          p_key: "commercial_open",
          p_value: true,
          p_reason: "Tentative prématurée de test",
        }),
        "LEGAL_VALIDATION_REQUIRED"
      );
      await expectError(
        adminCall(db, admin, "admin_set_platform_flag", {
          p_key: "legal_validation_complete",
          p_value: true,
          p_reason: "Tentative sans références de test",
        }),
        "LEGAL_VALIDATIONS_INCOMPLETE"
      );
      const status = (await asService(db, () => db.query("select status from public.trips where id = $1", [tripId]))).rows[0].status;
      assert.equal(status, "draft");
    } finally {
      await db.close();
    }
  });

  test("GP : soumission en attente, documents privés, aucune auto-approbation, décision admin auditée", serial, async () => {
    const { db, ids, gpSubmission } = fixture;
    const verification = (await asService(db, () => db.query("select * from public.gp_verifications where user_id = $1", [ids.gp]))).rows[0];
    assert.equal(verification.status, "approved");
    assert.equal(verification.identity_status, "checked");
    assert.equal(verification.documents_status, "checked");
    const docs = (await asService(db, () => db.query("select * from public.verification_documents where user_id = $1", [ids.gp]))).rows;
    assert.ok(docs.some((doc) => doc.storage_path === gpSubmission));
    assert.ok(docs.every((doc) => doc.storage_bucket === "gp-documents"));

    await expectError(
      adminCall(db, ids.admin, "admin_review_gp", {
        p_user_id: ids.admin,
        p_decision: "approved",
        p_note: "Tentative d auto-approbation",
      }),
      "SELF_APPROVAL_FORBIDDEN"
    );
    await asUser(db, ids.admin, () => callRpcNamed(db, "submit_gp_verification", {
      p_legal_first_name: "Admin",
      p_legal_last_name: "Test",
      p_phone: "+33612345678",
      p_travel_departure_at: futureIso(30),
      p_travel_destination: "Dakar",
      p_travel_capacity_kg: 10,
      p_identity_doc_path: `${ids.admin}/identity.pdf`,
      p_idempotency_key: "admin-self-verification-0001",
      p_accept_terms: true,
    }));
    await expectError(
      adminCall(db, ids.admin, "admin_review_gp", {
        p_user_id: ids.admin,
        p_decision: "approved",
        p_note: "Tentative d auto-approbation interdite",
      }),
      "SELF_APPROVAL_FORBIDDEN"
    );
    await expectError(
      adminCall(db, ids.admin, "admin_grant_role", {
        p_user_id: ids.admin,
        p_role: "admin",
        p_reason: "Tentative de modification de ses propres rôles",
      }),
      "SELF_ROLE_CHANGE_FORBIDDEN"
    );
    await expectError(
      asService(db, () => db.query("update public.gp_verification_events set note = 'modifié'")),
      "IMMUTABLE_RECORD"
    );

    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "submit_gp_verification", {
        p_legal_first_name: "Eve",
        p_legal_last_name: "Test",
        p_phone: "+33612345678",
        p_travel_departure_at: futureIso(30),
        p_travel_destination: "Dakar",
        p_travel_capacity_kg: 10,
        p_identity_doc_path: `${ids.gp}/identity-intrusive.pdf`,
        p_idempotency_key: "invalid-path-00000001",
        p_accept_terms: true,
      })),
      "INVALID_DOCUMENT_PATH"
    );
  });

  test("Recherche : ne retourne que les trajets futurs publiés, approuvés et sur liaison active", serial, async () => {
    const { db, ids, tripId } = fixture;
    const trips = await asUser(db, ids.sender1, () => callSetRpcNamed(db, "search_trips", {
      p_origin: "Paris",
      p_destination: "Dakar",
      p_date: null,
      p_min_capacity: 1,
    }));
    assert.ok(trips.some((trip) => trip.id === tripId));
    assert.ok(trips.every((trip) => trip.status === undefined));
    assert.ok(trips.every((trip) => trip.gp_verification_status === "approved"));
    assert.ok(trips.every((trip) => !("validation_notes" in trip)));

    const hiddenTrip = await asUser(db, ids.gp, () => callRpcNamed(db, "create_trip_draft", {
      p_corridor_id: fixture.corridor,
      p_origin_city: "Lyon",
      p_destination_city: "Dakar",
      p_departure_at: futureIso(16),
      p_capacity_kg: 5,
      p_currency: "EUR",
      p_price_per_kg: 10,
      p_conditions: null,
    }));
    const lyon = await asUser(db, ids.sender1, () => callSetRpcNamed(db, "search_trips", {
      p_origin: "Lyon",
      p_destination: "Dakar",
      p_date: null,
      p_min_capacity: 1,
    }));
    assert.ok(!lyon.some((trip) => trip.id === hiddenTrip), "Un brouillon ne doit jamais apparaître");
  });

  test("Demandes : idempotence, anti-doublon, réservation atomique et refus sans surréservation", serial, async () => {
    const { db, ids, tripId, request1, request2, code1 } = fixture;
    const sameCode = await asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 12, "request-sender1-000001")));
    assert.equal(sameCode, code1);
    const duplicateCount = (await asService(db, () => db.query(
      "select count(*)::int as n from public.parcel_requests where sender_id = $1 and idempotency_key = $2",
      [ids.sender1, "request-sender1-000001"]
    ))).rows[0].n;
    assert.equal(duplicateCount, 1);

    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(tripId, 12, "request-sender1-duplicate"))),
      "DUPLICATE_REQUEST"
    );
    const capacity = Number((await asService(db, () => db.query("select capacity_remaining_kg from public.trips where id = $1", [tripId]))).rows[0].capacity_remaining_kg);
    assert.equal(capacity, 8);

    await expectError(
      asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
        p_request_id: request2.id,
        p_accept: true,
        p_note: null,
      })),
      "CAPACITY_EXHAUSTED"
    );
    const afterFailure = Number((await asService(db, () => db.query("select capacity_remaining_kg from public.trips where id = $1", [tripId]))).rows[0].capacity_remaining_kg);
    assert.equal(afterFailure, 8, "Une transaction refusée ne doit consommer aucune capacité");

    const bookingCount = (await asService(db, () => db.query("select count(*)::int as n from public.bookings where parcel_request_id = $1", [request1.id]))).rows[0].n;
    assert.equal(bookingCount, 1);
    await expectError(
      asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
        p_request_id: request1.id,
        p_accept: true,
        p_note: null,
      })),
      "REQUEST_NOT_DECIDABLE"
    );
  });

  test("Passeport : transitions contrôlées, chaîne de hachage, code serveur et remise", serial, async () => {
    const { db, ids, booking1, code1 } = fixture;
    const step = (type) => asUser(db, ids.gp, () => callRpcNamed(db, "advance_booking", {
      p_booking_id: booking1,
      p_event_type: type,
      p_note: null,
    }));
    await expectError(step("arrival_reported"), "INVALID_BOOKING_TRANSITION");
    for (const type of ["parcel_received", "inspection_recorded", "departure_reported", "arrival_reported", "ready_for_pickup"]) {
      await step(type);
    }

    const events = (await asService(db, () => db.query(
      "select * from public.passport_events where parcel_code = $1 order by sequence_no",
      [code1]
    ))).rows;
    assert.ok(events.length >= 9);
    for (let index = 1; index < events.length; index += 1) {
      assert.equal(events[index].prev_hash, events[index - 1].event_hash);
      assert.equal(events[index].sequence_no, events[index - 1].sequence_no + 1);
    }
    await expectError(
      asService(db, () => db.query("update public.passport_events set note = 'altéré' where parcel_code = $1", [code1])),
      "IMMUTABLE_RECORD"
    );
    await expectError(
      asService(db, () => db.query("delete from public.passport_events where parcel_code = $1", [code1])),
      "IMMUTABLE_RECORD"
    );

    const code = await asUser(db, ids.sender1, () => callRpcNamed(db, "issue_delivery_code", { p_booking_id: booking1 }));
    assert.match(code, /^JC-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
    const stored = (await asService(db, () => db.query("select * from public.delivery_codes where booking_id = $1", [booking1]))).rows[0];
    assert.notEqual(stored.code_hash, code);
    assert.ok(!stored.code_hash.includes(code.replace(/[^0-9A-F]/g, "")));
    await expectError(
      asUser(db, ids.sender1, () => callRpcNamed(db, "issue_delivery_code", { p_booking_id: booking1 })),
      "DELIVERY_CODE_ALREADY_ISSUED"
    );
    assert.equal(await asUser(db, ids.gp, () => callRpcNamed(db, "verify_delivery_code", {
      p_parcel_code: code1,
      p_code: "JC-0000-0000-0000-0000",
    })), false);
    assert.equal(await asUser(db, ids.gp, () => callRpcNamed(db, "verify_delivery_code", {
      p_parcel_code: code1,
      p_code: code,
    })), true);
    const booking = (await asService(db, () => db.query("select status, delivered_at from public.bookings where id = $1", [booking1]))).rows[0];
    assert.equal(booking.status, "delivered");
    assert.ok(booking.delivered_at);
    await expectError(
      asUser(db, ids.gp, () => callRpcNamed(db, "verify_delivery_code", {
        p_parcel_code: code1,
        p_code: code,
      })),
      "BOOKING_NOT_READY_FOR_PICKUP"
    );
  });

  test("Annulation : capacité libérée une seule fois, même si l'action est rejouée", serial, async () => {
    const { db, ids, corridor } = fixture;
    const trip = await asUser(db, ids.gp, () => callRpcNamed(db, "create_trip_draft", {
      p_corridor_id: corridor,
      p_origin_city: "Lyon",
      p_destination_city: "Dakar",
      p_departure_at: futureIso(25),
      p_capacity_kg: 10,
      p_currency: "EUR",
      p_price_per_kg: 10,
      p_conditions: null,
    }));
    await asUser(db, ids.gp, () => callRpcNamed(db, "publish_my_trip", { p_trip_id: trip }));
    const parcelCode = await asUser(db, ids.sender2, () => callRpcNamed(db, "submit_parcel_request", requestArgs(trip, 4, "request-cancel-000001")));
    const request = (await asService(db, () => db.query("select id from public.parcel_requests where parcel_code = $1", [parcelCode]))).rows[0];
    const booking = await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", {
      p_request_id: request.id,
      p_accept: true,
      p_note: null,
    }));
    assert.equal(Number((await asService(db, () => db.query("select capacity_remaining_kg from public.trips where id = $1", [trip]))).rows[0].capacity_remaining_kg), 6);
    await asUser(db, ids.sender2, () => callRpcNamed(db, "cancel_booking", { p_booking_id: booking, p_reason: "Annulation de test" }));
    await asUser(db, ids.sender2, () => callRpcNamed(db, "cancel_booking", { p_booking_id: booking, p_reason: "Annulation de test" }));
    assert.equal(Number((await asService(db, () => db.query("select capacity_remaining_kg from public.trips where id = $1", [trip]))).rows[0].capacity_remaining_kg), 10);
    const releasedEvents = (await asService(db, () => db.query(
      "select count(*)::int as n from public.passport_events where booking_id = $1 and event_type = 'capacity_released'",
      [booking]
    ))).rows[0].n;
    assert.equal(releasedEvents, 1);
  });

  test("Procédure de secours administrateur : remise explicitement auditée et codes révoqués", serial, async () => {
    const { db, ids, corridor } = fixture;
    const trip = await asUser(db, ids.gp, () => callRpcNamed(db, "create_trip_draft", {
      p_corridor_id: corridor,
      p_origin_city: "Paris",
      p_destination_city: "Dakar",
      p_departure_at: futureIso(28),
      p_capacity_kg: 10,
      p_currency: "EUR",
      p_price_per_kg: 10,
      p_conditions: null,
    }));
    await asUser(db, ids.gp, () => callRpcNamed(db, "publish_my_trip", { p_trip_id: trip }));
    const parcelCode = await asUser(db, ids.sender1, () => callRpcNamed(db, "submit_parcel_request", requestArgs(trip, 2, "request-fallback-000001")));
    const request = (await asService(db, () => db.query("select id from public.parcel_requests where parcel_code = $1", [parcelCode]))).rows[0];
    const booking = await asUser(db, ids.gp, () => callRpcNamed(db, "respond_to_request", { p_request_id: request.id, p_accept: true, p_note: null }));
    await asUser(db, ids.sender1, () => callRpcNamed(db, "confirm_booking", { p_booking_id: booking }));
    for (const type of ["parcel_received", "departure_reported", "arrival_reported", "ready_for_pickup"]) {
      await asUser(db, ids.gp, () => callRpcNamed(db, "advance_booking", { p_booking_id: booking, p_event_type: type, p_note: null }));
    }
    await asUser(db, ids.sender1, () => callRpcNamed(db, "issue_delivery_code", { p_booking_id: booking }));
    await adminCall(db, ids.admin, "admin_handover_fallback", {
      p_booking_id: booking,
      p_reason: "Code perdu, identité du destinataire vérifiée hors ligne, procédure de test",
    });
    const result = (await asService(db, () => db.query("select status from public.bookings where id = $1", [booking]))).rows[0];
    assert.equal(result.status, "delivered");
    const audit = (await asService(db, () => db.query(
      "select count(*)::int as n from public.audit_logs where action = 'admin_handover_fallback' and entity_id = $1",
      [booking]
    ))).rows[0].n;
    assert.equal(audit, 1);
    const revoked = (await asService(db, () => db.query("select revoked_at from public.delivery_codes where booking_id = $1", [booking]))).rows[0];
    assert.ok(revoked.revoked_at);
  });

  test("Notifications : aucun faux envoi, revendication, historique immuable et rejeu contrôlé", serial, async () => {
    const { db, ids } = fixture;
    const blocked = (await asService(db, () => db.query(
      "select count(*)::int as n from public.notification_outbox where channel = 'whatsapp' and status = 'blocked' and last_error = 'WHATSAPP_PROVIDER_NOT_CONFIGURED'"
    ))).rows[0].n;
    assert.ok(blocked > 0, "WhatsApp non configuré doit rester bloqué, jamais « envoyé »");
    await expectError(
      asUser(db, ids.sender1, () => db.query("select * from public.claim_notifications(5, 'test')")),
      "permission denied"
    );
    const claimed = (await asService(db, () => db.query("select * from public.claim_notifications(3, 'test')"))).rows;
    assert.ok(claimed.length > 0);
    assert.ok(claimed.every((row) => ["email", "whatsapp"].includes(row.channel) && row.status === "claimed"));
    const first = claimed[0];
    await expectError(
      asService(db, () => db.query("select public.record_notification_result($1,$2,$3,$4,$5,$6,$7)", [
        first.id, randomUUID(), "sent", "provider-test", "msg-1", 200, null,
      ])),
      "NOTIFICATION_CLAIM_MISMATCH"
    );
    await asService(db, () => db.query("select public.record_notification_result($1,$2,$3,$4,$5,$6,$7)", [
      first.id, first.claim_token, "sent", "provider-test", "msg-1", 200, null,
    ]));
    const sent = (await asService(db, () => db.query("select status, sent_at from public.notification_outbox where id = $1", [first.id]))).rows[0];
    assert.equal(sent.status, "sent");
    assert.ok(sent.sent_at);
    await expectError(
      asService(db, () => db.query("update public.notification_attempts set error_code = 'altéré'")),
      "IMMUTABLE_RECORD"
    );
    const attempts = (await asService(db, () => db.query(
      "select count(*)::int as n from public.notification_attempts where notification_id = $1 and status = 'sent'",
      [first.id]
    ))).rows[0].n;
    assert.equal(attempts, 1);
  });

  test("RLS, stockage privé, journal d'audit et suivi public sans donnée personnelle", serial, async () => {
    const { db, ids, code1 } = fixture;
    const otherRequests = await asUser(db, ids.sender1, () => db.query(
      "select count(*)::int as n from public.parcel_requests where sender_id = $1",
      [ids.sender2]
    ));
    assert.equal(otherRequests.rows[0].n, 0);
    await expectError(
      asUser(db, ids.sender1, () => db.query(
        "insert into storage.objects (bucket_id, name) values ('gp-documents', $1)",
        [`${ids.sender2}/intrusion.pdf`]
      )),
      "row-level security policy"
    );
    await asUser(db, ids.sender1, () => db.query(
      "insert into storage.objects (bucket_id, name) values ('gp-documents', $1)",
      [`${ids.sender1}/identity.pdf`]
    ));
    const ownDocs = await asUser(db, ids.sender1, () => db.query("select count(*)::int as n from storage.objects where split_part(name, '/', 1) = $1", [ids.sender1]));
    assert.equal(ownDocs.rows[0].n, 1);
    await expectError(
      asService(db, () => db.query("update public.audit_logs set action = 'altéré'")),
      "IMMUTABLE_RECORD"
    );

    const publicEvents = await asService(db, () => db.query("select * from public.get_parcel_passport($1)", [code1]));
    assert.ok(publicEvents.rows.length > 0);
    assert.ok(publicEvents.rows.every((row) => row.event_hash && row.sequence_no));
    const columns = Object.keys(publicEvents.rows[0]);
    assert.ok(!columns.some((column) => /recipient|phone|email|identity|code_hash|salt/i.test(column)));

    const overview = await asUser(db, ids.admin, () => callRpc(db, "admin_overview", []));
    assert.ok(overview.counts.profiles >= 5);
    assert.ok(Array.isArray(overview.audit_logs));
    await expectError(
      asUser(db, ids.sender1, () => callRpc(db, "admin_overview", [])),
      "ADMIN_REQUIRED"
    );
  });

  test("Le worker de notifications ne contient aucun secret et n'écrit 'sent' que sur 2xx", serial, async () => {
    const source = await readFile(new URL("../supabase/functions/notification-worker/index.ts", import.meta.url), "utf8");
    assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
    assert.match(source, /WhatsApp Cloud API/);
    assert.match(source, /response\.ok/);
    assert.doesNotMatch(source, /sb_secret|sk_live|Bearer\s+[A-Za-z0-9._-]{20,}/i);
    assert.doesNotMatch(source, /localStorage/);
    assert.match(source, /Aucun message n'est marqué "sent" sans réponse HTTP 2xx/);
  });
});
