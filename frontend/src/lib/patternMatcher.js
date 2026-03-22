const MATCHER_CONFIG = {
  TIMING_RUSH_MS: -150,
  TIMING_LAG_MS: 150,
  VELOCITY_HIGH: 100,
  VELOCITY_LOW: 40,
};

// --- Note Distance Calculation Helpers ---
const NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteToMidi(noteName) {
  if (!noteName) return 0;
  const match = noteName.match(/^([A-G]#?)(-?\d+)$/);
  if (!match) return 0;
  const pitchClass = NOTES.indexOf(match[1]);
  const octave = parseInt(match[2], 10);
  return (octave + 1) * 12 + pitchClass;
}

function classifyPitch(expectedNoteName, playedNoteName) {
  if (expectedNoteName === playedNoteName) {
    return { type: 'correct_note', semitoneDistance: 0 };
  }
  const expectedMidi = noteToMidi(expectedNoteName);
  const playedMidi = noteToMidi(playedNoteName);
  const diff = Math.abs(expectedMidi - playedMidi);
  
  if (diff <= 2) {
    return { type: 'near_miss', semitoneDistance: diff, severity: 'medium' };
  }
  return { type: 'far_miss', semitoneDistance: diff, severity: 'high' };
}

function pushError(state, error) {
  state.phraseErrors.push(error);
  const count = state.sessionStats.totalErrorsByType[error.type] || 0;
  state.sessionStats.totalErrorsByType[error.type] = count + 1;
}

// --- Main Exports ---

export function buildExpectedSequenceFromSong(song) {
  if (!song || !song.tracks) return [];
  const allNotes = [];
  
  song.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      allNotes.push({
        note: note.name,
        time: note.time,
        duration: note.duration,
        velocity: note.velocity,
      });
    });
  });

  allNotes.sort((a, b) => a.time - b.time);
  return allNotes.map((n, i) => ({ ...n, position: i }));
}

export function createMatcherState() {
  return {
    expectedIndex: 0,
    phraseNotes: [],
    phraseErrors: [],
    fullHistory: [], // The clean timeline array
    recurringErrors: {},
    sessionStats: {
      totalNotes: 0,
      correctNotes: 0,
      streak: 0,
      bestStreak: 0,
      phrasesCompleted: 0,
      totalErrorsByType: {},
    },
  };
}

export function detectSkippedNotes({ state, expectedNotes, playbackTimeSeconds }) {
  const nextState = structuredClone(state);
  
  while (nextState.expectedIndex < expectedNotes.length) {
    const expected = expectedNotes[nextState.expectedIndex];
    // If the note has passed the lag window and hasn't been played
    if (playbackTimeSeconds * 1000 - expected.time * 1000 > MATCHER_CONFIG.TIMING_LAG_MS + 200) {
       const skipError = {
          position: expected.position,
          expected: expected.note,
          played: null,
          expectedTime: expected.time,
          playedTime: playbackTimeSeconds,
          type: 'skipped_note',
          severity: 'high',
          timestamp: performance.now()
       };
       pushError(nextState, skipError);
       nextState.expectedIndex += 1;
    } else {
      break; 
    }
  }
  return nextState;
}

export function evaluatePlayedNote({
  state,
  expectedNote,
  playedNote,
  playedTimeSeconds,
  velocity,
}) {
  const nextState = structuredClone(state);

  const result = {
    feedbackType: 'neutral',
    expected: expectedNote ? expectedNote.note : null,
    played: playedNote,
    events: [],
  };

  // 1. If the song is completely over
  if (!expectedNote) {
    nextState.fullHistory.push({
      position: null,
      expected: null,
      played: playedNote,
      velocity,
      timingDeltaMs: null,
      time: playedTimeSeconds,
    });
    result.feedbackType = 'extra_note';
    return { state: nextState, result };
  }

  // 2. Check the timing against the currently falling waterfall note
  const timingDeltaMs = Math.round((playedTimeSeconds - expectedNote.time) * 1000);

  // 3. Protect the waterfall keys! (Don't consume if played way too early)
  if (timingDeltaMs < -400) {
    nextState.fullHistory.push({
      position: null,
      expected: null,
      played: playedNote,
      velocity,
      timingDeltaMs: null, 
      time: playedTimeSeconds,
    });
    result.feedbackType = 'extra_note';
    return { state: nextState, result };
  }

  // 4. Normal Evaluation
  nextState.sessionStats.totalNotes += 1;

  const baseEvent = {
    position: expectedNote.position,
    expected: expectedNote.note,
    played: playedNote,
    expectedTime: expectedNote.time,
    playedTime: playedTimeSeconds,
    timingDeltaMs,
    velocity,
    timestamp: performance.now(),
  };

  const pitch = classifyPitch(expectedNote.note, playedNote);

  if (pitch.type === 'correct_note') {
    nextState.sessionStats.correctNotes += 1;
    nextState.sessionStats.streak += 1;
    nextState.sessionStats.bestStreak = Math.max(
      nextState.sessionStats.bestStreak,
      nextState.sessionStats.streak
    );
    result.feedbackType = 'correct';
  } else {
    nextState.sessionStats.streak = 0;
    const pitchError = {
      ...baseEvent,
      type: pitch.type,
      semitoneDistance: pitch.semitoneDistance,
      severity: pitch.severity,
    };
    pushError(nextState, pitchError);
    result.events.push(pitchError);
    result.feedbackType = pitch.type === 'near_miss' ? 'near_miss' : pitch.type === 'far_miss' ? 'far_miss' : 'wrong';
  }

  // Record Timing and Velocity errors
  if (timingDeltaMs < MATCHER_CONFIG.TIMING_RUSH_MS) {
    const timingError = { ...baseEvent, type: 'timing_rush', severity: 'medium' };
    pushError(nextState, timingError);
    result.events.push(timingError);
  } else if (timingDeltaMs > MATCHER_CONFIG.TIMING_LAG_MS) {
    const timingError = { ...baseEvent, type: 'timing_lag', severity: 'medium' };
    pushError(nextState, timingError);
    result.events.push(timingError);
  }

  if (velocity != null && velocity > MATCHER_CONFIG.VELOCITY_HIGH) {
    const velocityError = { ...baseEvent, type: 'velocity_high', severity: 'low' };
    pushError(nextState, velocityError);
    result.events.push(velocityError);
  } else if (velocity != null && velocity < MATCHER_CONFIG.VELOCITY_LOW) {
    const velocityError = { ...baseEvent, type: 'velocity_low', severity: 'low' };
    pushError(nextState, velocityError);
    result.events.push(velocityError);
  }

  // Add the attempt to history
  const noteRecord = {
    position: expectedNote.position,
    expected: expectedNote.note,
    played: playedNote,
    velocity,
    timingDeltaMs,
    time: playedTimeSeconds,
  };

  nextState.phraseNotes.push(noteRecord);
  nextState.fullHistory.push(noteRecord);

  // Consume the note
  nextState.expectedIndex += 1;

  return { state: nextState, result };
}

export function shouldCompletePhrase(state, lastPlayedAt, now) {
  if (state.phraseNotes.length === 0) return false;
  if (now - lastPlayedAt > 1500) return true; // 1.5s pause means phrase complete
  return false;
}

export function finalizePhrase(state) {
  const nextState = structuredClone(state);
  nextState.sessionStats.phrasesCompleted += 1;

  const totalPhraseNotes = nextState.phraseNotes.length;
  const correctPhraseNotes = nextState.phraseNotes.filter(n => n.expected === n.played).length;
  const phraseAccuracy = totalPhraseNotes > 0 ? correctPhraseNotes / totalPhraseNotes : 0;
  
  const phraseSummary = {
    phraseNumber: nextState.sessionStats.phrasesCompleted,
    notes: nextState.phraseNotes,
    errors: nextState.phraseErrors,
    accuracy: phraseAccuracy,
    sessionAccuracy: nextState.sessionStats.totalNotes > 0 
      ? nextState.sessionStats.correctNotes / nextState.sessionStats.totalNotes 
      : 0
  };

  // Reset for next phrase
  nextState.phraseNotes = [];
  nextState.phraseErrors = [];

  return { state: nextState, phraseSummary };
}