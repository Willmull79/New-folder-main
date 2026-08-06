/**
 * One-time Admin backfill: set leagues/{id}.memberIds from team ownerIds + commissioners.
 * Run BEFORE deploying tightened firestore.rules.
 *
 * Usage (from repo root):
 *   node scripts/backfill-member-ids.js
 *
 * Uses GOOGLE_APPLICATION_CREDENTIALS or backend/serviceAccount.json / functions credentials.
 */
const path = require('path');
const fs = require('fs');

// Prefer backend's firebase-admin install
const admin = require(path.join(__dirname, '..', 'backend', 'node_modules', 'firebase-admin'));

function initAdmin() {
  if (admin.apps.length) return admin.app();

  const candidates = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.join(__dirname, '..', 'backend', 'serviceAccount.json'),
    path.join(__dirname, '..', 'serviceAccount.json'),
    path.join(__dirname, '..', 'functions', 'serviceAccount.json'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
    if (fs.existsSync(resolved)) {
      const sa = require(resolved);
      return admin.initializeApp({
        credential: admin.credential.cert(sa),
        projectId: sa.project_id || 'dynasty-420',
      });
    }
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    projectId: 'dynasty-420',
  });
}

async function backfill() {
  initAdmin();
  const db = admin.firestore();
  const leaguesSnap = await db.collection('leagues').get();
  console.log(`Found ${leaguesSnap.size} leagues`);

  let updated = 0;
  for (const leagueDoc of leaguesSnap.docs) {
    const data = leagueDoc.data() || {};
    const memberSet = new Set(Array.isArray(data.memberIds) ? data.memberIds : []);

    if (data.commissionerId) memberSet.add(data.commissionerId);
    (Array.isArray(data.coCommissioners) ? data.coCommissioners : []).forEach((id) => memberSet.add(id));
    (Array.isArray(data.members) ? data.members : []).forEach((id) => memberSet.add(id));

    const teamsSnap = await leagueDoc.ref.collection('teams').get();
    teamsSnap.docs.forEach((teamDoc) => {
      const ownerId = teamDoc.data()?.ownerId;
      if (ownerId) memberSet.add(ownerId);
    });

    const memberIds = [...memberSet].filter(Boolean);
    const existing = Array.isArray(data.memberIds) ? data.memberIds : [];
    const same =
      existing.length === memberIds.length
      && memberIds.every((id) => existing.includes(id));

    if (same) {
      console.log(`OK   ${leagueDoc.id} (${memberIds.length} members)`);
      continue;
    }

    await leagueDoc.ref.update({ memberIds, members: memberIds });
    updated += 1;
    console.log(`FIX  ${leagueDoc.id} -> ${memberIds.length} members`);
  }

  console.log(`Done. Updated ${updated} / ${leaguesSnap.size} leagues.`);
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
