import { create } from 'zustand';

export const useStore = create((set, get) => ({
  // ── Practice mode ────────────────────────────────
  mode: 'guided', // guided | freeplay | jam | boss | ear
  setMode: (mode) => set({ mode }),

  // ── Tempo ────────────────────────────────────────
  tempo: 120, // in BPM
  setTempo: (tempo) => set({ tempo }),

  // ── Coach messages ───────────────────────────────
  coachMessages: [],
  addCoachMessage: (msg) => set((s) => ({
    coachMessages: [...s.coachMessages.slice(-50), {
      ...msg,
      id: Date.now() + Math.random(),
      timestamp: Date.now(),
    }],
  })),
  isCoachThinking: false,
  setCoachThinking: (v) => set({ isCoachThinking: v }),

  // Clear the last message (for streaming replacement)
  replaceLastCoachMessage: (content) => set((s) => {
    const msgs = [...s.coachMessages];
    if (msgs.length > 0) {
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content };
    }
    return { coachMessages: msgs };
  }),

  // ── Skill graph ──────────────────────────────────
  skills: [
    { id: 'c-major', name: 'C Major Scale', mastery: 0, category: 'scales' },
    { id: 'g-major', name: 'G Major Scale', mastery: 0, category: 'scales' },
    { id: 'triads', name: 'Basic Triads', mastery: 0, category: 'chords' },
    { id: 'quarter', name: 'Quarter Notes', mastery: 0, category: 'rhythm' },
    { id: 'eighth', name: 'Eighth Notes', mastery: 0, category: 'rhythm' },
    { id: 'fingers', name: 'Finger Independence', mastery: 0, category: 'technique' },
    { id: 'treble', name: 'Treble Clef', mastery: 0, category: 'reading' },
    { id: 'intervals', name: 'Intervals', mastery: 0, category: 'theory' },
  ],
  updateSkill: (id, mastery) => set((s) => ({
    skills: s.skills.map((sk) =>
      sk.id === id ? { ...sk, mastery: Math.min(1, mastery) } : sk
    ),
  })),

  // ── Session history (persisted via InsForge) ─────
  sessionHistory: [],
  addSession: (session) => set((s) => ({
    sessionHistory: [session, ...s.sessionHistory].slice(0, 50),
  })),
}));
