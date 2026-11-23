const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_stalker_123";
const BOB_UID = "bob_bandit_456";
const SECTOR_ID = "zone_1";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function validProfile(uid, ts) {
  return {
    userId: uid,
    callsign: "Стрелок",
    faction: "stalker",
    money: 8500,
    kills: 2,
    deaths: 0,
    artifactsFound: 1,
    armorId: "leather",
    primaryWeaponId: "ak74m",
    secondaryWeaponId: "pm",
    sectorId: SECTOR_ID,
    createdAt: ts,
    updatedAt: ts,
  };
}

function validPresence(uid, ts, overrides = {}) {
  return {
    userId: uid,
    sectorId: SECTOR_ID,
    callsign: "Стрелок",
    faction: "stalker",
    weaponId: "ak74m",
    x: 4.5,
    y: 0.2,
    z: -3.1,
    yaw: 1.25,
    hp: 100,
    moving: true,
    firing: false,
    online: true,
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function validPvpHit(attackerUid, targetUid, ts, overrides = {}) {
  return {
    attackerUid,
    attackerName: "Стрелок",
    attackerFaction: "stalker",
    targetUid,
    sectorId: SECTOR_ID,
    damage: 24,
    headshot: false,
    weapon: "АК-74М",
    createdAt: ts,
    ...overrides,
  };
}

function validChatMsg(uid, ts, overrides = {}) {
  return {
    userId: uid,
    sectorId: SECTOR_ID,
    callsign: "Стрелок",
    faction: "stalker",
    text: "Бандиты у Депо, аккуратнее!",
    createdAt: ts,
    ...overrides,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules, host: emulatorHost, port: emulatorPort },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  if (testEnv) await testEnv.clearFirestore();
});

test("Unauthenticated user: denied across all 4 collections", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const ts = new Date(Date.now() - 2000);

  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).set(validProfile(ALICE_UID, ts)));
  await assertFails(
    unauthDb.collection("sectors").doc(SECTOR_ID).collection("players")
      .where("sectorId", "==", SECTOR_ID).where("online", "==", true).get()
  );
  await assertFails(
    unauthDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits")
      .where("targetUid", "==", ALICE_UID).where("sectorId", "==", SECTOR_ID).get()
  );
  await assertFails(
    unauthDb.collection("sectors").doc(SECTOR_ID).collection("chat")
      .where("sectorId", "==", SECTOR_ID).get()
  );
});

test("UserProfile: owner create/update/read succeeds; cross-user & ghost fields fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);
  const updated = new Date(Date.now() - 1000);

  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).set(validProfile(ALICE_UID, created)));
  await assertSucceeds(aliceDb.collection("users").doc(ALICE_UID).get());
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).update({
      callsign: "Меченый",
      faction: "bandit",
      money: 15200,
      kills: 5,
      deaths: 1,
      artifactsFound: 3,
      armorId: "zarya",
      primaryWeaponId: "as_val",
      secondaryWeaponId: "pm",
      sectorId: "zone_2",
      updatedAt: updated,
    })
  );

  await assertFails(bobDb.collection("users").doc(ALICE_UID).get());
  await assertFails(bobDb.collection("users").doc(ALICE_UID).update({ money: 999999, updatedAt: updated }));
  await assertFails(aliceDb.collection("users").doc(ALICE_UID).update({ createdAt: updated, updatedAt: updated }));
  await assertFails(aliceDb.collection("users").doc(ALICE_UID).update({ isAdmin: true, updatedAt: updated }));
  await assertFails(bobDb.collection("users").doc(BOB_UID).set({ ...validProfile(BOB_UID, created), id: BOB_UID }));
  await assertFails(bobDb.collection("users").doc(BOB_UID).set(validProfile(BOB_UID, new Date(Date.now() + 60000))));
});

test("SectorPlayer: owner writes, filtered query succeeds, unfiltered & cross-user fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const created = new Date(Date.now() - 10000);
  const updated = new Date(Date.now() - 1000);

  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("players").doc(ALICE_UID)
      .set(validPresence(ALICE_UID, created))
  );
  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("players").doc(ALICE_UID)
      .update({
        callsign: "Стрелок", faction: "stalker", weaponId: "vss",
        x: 12.4, y: 1.1, z: -42.0, yaw: 2.1, hp: 92,
        moving: true, firing: true, online: true, updatedAt: updated,
      })
  );
  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("players")
      .where("sectorId", "==", SECTOR_ID).where("online", "==", true).get()
  );
  await assertFails(aliceDb.collection("sectors").doc(SECTOR_ID).collection("players").get());
  await assertFails(
    bobDb.collection("sectors").doc(SECTOR_ID).collection("players").doc(ALICE_UID)
      .update({ hp: 0, updatedAt: updated })
  );
  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("players").doc(ALICE_UID)
      .update({ online: false, updatedAt: updated })
  );
});

test("PvpHitEvent: bounded hit creation, target query & delete succeed; cheats fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const ts = new Date(Date.now() - 1000);

  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits").doc("hit_001")
      .set(validPvpHit(ALICE_UID, BOB_UID, ts, { damage: 35, headshot: true }))
  );
  await assertSucceeds(
    bobDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits")
      .where("targetUid", "==", BOB_UID).where("sectorId", "==", SECTOR_ID).get()
  );
  await assertFails(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits")
      .where("targetUid", "==", BOB_UID).where("sectorId", "==", SECTOR_ID).get()
  );
  await assertFails(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits").doc("hit_cheat")
      .set(validPvpHit(ALICE_UID, BOB_UID, ts, { damage: 999 }))
  );
  await assertFails(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits").doc("hit_self")
      .set(validPvpHit(ALICE_UID, ALICE_UID, ts))
  );
  await assertFails(aliceDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits").doc("hit_001").delete());
  await assertSucceeds(bobDb.collection("sectors").doc(SECTOR_ID).collection("pvp_hits").doc("hit_001").delete());
});

test("SectorChatMessage: sector query & post succeed; empty/oversized/spoofed fail", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobDb = testEnv.authenticatedContext(BOB_UID).firestore();
  const ts = new Date(Date.now() - 1000);

  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_1")
      .set(validChatMsg(ALICE_UID, ts))
  );
  await assertSucceeds(
    bobDb.collection("sectors").doc(SECTOR_ID).collection("chat")
      .where("sectorId", "==", SECTOR_ID).get()
  );
  await assertFails(bobDb.collection("sectors").doc(SECTOR_ID).collection("chat").get());
  await assertFails(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_empty")
      .set(validChatMsg(ALICE_UID, ts, { text: "" }))
  );
  await assertFails(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_long")
      .set(validChatMsg(ALICE_UID, ts, { text: "x".repeat(200) }))
  );
  await assertFails(
    bobDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_spoof")
      .set(validChatMsg(ALICE_UID, ts))
  );
  await assertFails(
    bobDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_1").delete()
  );
  await assertSucceeds(
    aliceDb.collection("sectors").doc(SECTOR_ID).collection("chat").doc("msg_1").delete()
  );
});
