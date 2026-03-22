/**
 * InsForge Client — connects to InsForge REST API for data persistence.
 * InsForge exposes a Supabase-compatible REST API.
 */

const INSFORGE_URL = import.meta.env.VITE_INSFORGE_URL || '';
const INSFORGE_KEY = import.meta.env.VITE_INSFORGE_ANON_KEY || '';

async function request(path, options = {}) {
  if (!INSFORGE_URL || !INSFORGE_KEY) return null;

  const res = await fetch(`${INSFORGE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      apikey: INSFORGE_KEY,
      Authorization: `Bearer ${INSFORGE_KEY}`,
      ...options.headers,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

export function isInsForgeConfigured() {
  return !!(INSFORGE_URL && INSFORGE_KEY);
}

// ── Learner profiles ───────────────────────────────
export async function getOrCreateLearner(email, name) {
  const existing = await request(`/rest/v1/learners?email=eq.${encodeURIComponent(email)}&select=*`);
  if (existing?.length > 0) return existing[0];

  const created = await request('/rest/v1/learners', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ email, display_name: name, skill_level: 'beginner' }),
  });
  return created?.[0] || null;
}

// ── Save practice session ──────────────────────────
export async function saveSession(session) {
  return request('/rest/v1/practice_sessions', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(session),
  });
}

// ── Get practice history ───────────────────────────
export async function getHistory(learnerId, limit = 20) {
  return request(
    `/rest/v1/practice_sessions?learner_id=eq.${learnerId}&order=started_at.desc&limit=${limit}&select=*`
  );
}

// ── Sync skill graph ───────────────────────────────
export async function syncSkills(learnerId, skills) {
  const records = skills.map((s) => ({
    id: s.id,
    learner_id: learnerId,
    name: s.name,
    category: s.category,
    mastery: s.mastery,
    last_practiced: new Date().toISOString(),
  }));

  return request('/rest/v1/skill_nodes', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', Resolution: 'merge-duplicates' },
    body: JSON.stringify(records),
  });
}

// ── Get skills from server ─────────────────────────
export async function getSkills(learnerId) {
  return request(`/rest/v1/skill_nodes?learner_id=eq.${learnerId}&select=*`);
}

// ── Song library ───────────────────────────────────
export async function getSongs(maxDifficulty = 10) {
  return request(
    `/rest/v1/songs?difficulty=lte.${maxDifficulty}&order=difficulty.asc&limit=50&select=*`
  );
}

// ── Upload MIDI file to storage ────────────────────
export async function uploadMidi(fileName, fileData) {
  if (!INSFORGE_URL || !INSFORGE_KEY) return null;

  const res = await fetch(`${INSFORGE_URL}/storage/v1/object/midi-files/${fileName}`, {
    method: 'POST',
    headers: { apikey: INSFORGE_KEY, Authorization: `Bearer ${INSFORGE_KEY}` },
    body: fileData,
  });

  if (!res.ok) return null;
  return `${INSFORGE_URL}/storage/v1/object/public/midi-files/${fileName}`;
}
