import React from 'react';

// Automatically generate 5 full octaves (C2 to B6) + ending C7
const generateKeys = (startOctave, endOctave) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const keys = [];

  for (let oct = startOctave; oct <= endOctave; oct++) {
    notes.forEach((note) => {
      keys.push({
        note: `${note}${oct}`,
        type: note.includes('#') ? 'black' : 'white',
      });
    });
  }

  keys.push({ note: `C${endOctave + 1}`, type: 'white' }); // final C
  return keys;
};

const PIANO_KEYS = generateKeys(2, 6); // C2 to C7 (61 keys)

function getFeedbackStyle(feedbackType, isWhite) {
  const baseColor = isWhite ? 'white' : '#222';

  switch (feedbackType) {
    case 'correct':
      return {
        backgroundColor: '#28a745',
        borderColor: '#1f7a33',
      };

    case 'near_miss':
      return {
        backgroundColor: '#fd7e14',
        borderColor: '#cc650f',
      };

    case 'wrong':
    case 'far_miss':
    case 'note_skipped':
      return {
        backgroundColor: '#dc3545',
        borderColor: '#a71d2a',
      };

    case 'timing':
      return {
        backgroundColor: '#ffc107',
        borderColor: '#cc9a06',
      };

    case 'velocity':
      return {
        backgroundColor: '#17a2b8',
        borderColor: '#117a8b',
      };

    default:
      return {
        backgroundColor: baseColor,
        borderColor: '#ccc',
      };
  }
}

export function PianoKeyboard({
  activeNotes,
  onPlayNote,
  onStopNote,
  noteFeedback = {},
}) {
  const safeActiveNotes = activeNotes || [];

  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      {PIANO_KEYS.map(({ note, type }) => {
        const isActive = safeActiveNotes.includes(note);
        const isWhite = type === 'white';

        const feedback = noteFeedback[note] || null;
        const { backgroundColor, borderColor } = getFeedbackStyle(
          feedback?.type,
          isWhite
        );

        const finalBackground = isActive ? '#007bff' : backgroundColor;

        return (
          <div
            key={note}
            onMouseDown={() => onPlayNote(note)}
            onMouseUp={() => onStopNote(note)}
            onMouseLeave={() => onStopNote(note)}
            title={feedback?.label || note}
            style={{
              width: isWhite ? '40px' : '24px',
              height: isWhite ? '150px' : '90px',
              backgroundColor: finalBackground,
              border: `1px solid ${isActive ? '#0056b3' : borderColor}`,
              borderRadius: '0 0 4px 4px',
              margin: isWhite ? '0' : '0 -12px',
              zIndex: isWhite ? 1 : 2,
              position: 'relative',
              cursor: 'pointer',
              boxShadow: isActive
                ? 'inset 0 0 10px rgba(0,0,0,0.5)'
                : feedback
                ? 'inset 0 0 8px rgba(0,0,0,0.18)'
                : 'none',
              flexShrink: 0,
              transition: 'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
            }}
          />
        );
      })}
    </div>
  );
}