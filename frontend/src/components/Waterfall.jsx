import React, { useEffect, useRef } from 'react';
import { playNote, stopNote } from '../lib/AudioEngine';

const generateNotePositions = (startOctave, endOctave) => {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const positions = {};
  let currentLeft = 0;

  for (let oct = startOctave; oct <= endOctave; oct++) {
    notes.forEach(note => {
      const isBlack = note.includes('#');
      if (isBlack) {
        positions[`${note}${oct}`] = { left: currentLeft - 12, width: 24, color: '#00f2fe' };
      } else {
        positions[`${note}${oct}`] = { left: currentLeft, width: 40, color: '#4facfe' };
        currentLeft += 40;
      }
    });
  }
  positions[`C${endOctave + 1}`] = { left: currentLeft, width: 40, color: '#4facfe' };
  currentLeft += 40;

  return { positions, totalWidth: currentLeft };
};

const { positions: NOTE_POSITIONS, totalWidth: WATERFALL_WIDTH } = generateNotePositions(2, 6);

const PIXELS_PER_SECOND = 150; 
const WATERFALL_HEIGHT = 400; 

export function Waterfall({ song, isPlaying, onReset, audioEnabled, activeNotes, isWaitMode }) {
  const canvasRef = useRef(null);
  const timeRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const requestRef = useRef();
  
  const playingNotesRef = useRef(new Set());
  
  // We use a ref for activeNotes so the animation loop doesn't restart every time you press a key!
  const activeNotesRef = useRef(activeNotes);
  useEffect(() => {
    activeNotesRef.current = activeNotes;
  }, [activeNotes]);

  const track = song?.tracks.find(t => t.notes.length > 0);
  const notes = track ? track.notes : [];

  const stopAllActiveNotes = () => {
    playingNotesRef.current.forEach(index => {
      const note = notes[index];
      if (note) stopNote(note.name);
    });
    playingNotesRef.current.clear();
  };

  useEffect(() => {
    timeRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    stopAllActiveNotes();
  }, [song, onReset]);

  useEffect(() => {
    if (!isPlaying) stopAllActiveNotes();
  }, [isPlaying]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const draw = (now) => {
      const deltaSeconds = (now - lastFrameTimeRef.current) / 1000;
      lastFrameTimeRef.current = now;

      let shouldPause = false;
      const currentlyExpected = [];

      // 1. What notes SHOULD be playing right now?
      notes.forEach(note => {
        // We add a tiny 0.05s buffer so it doesn't pause unfairly early
        if (timeRef.current >= note.time && timeRef.current <= (note.time + note.duration - 0.05)) {
          currentlyExpected.push(note.name);
        }
      });

      // 2. WAIT MODE LOGIC: Are you missing any expected notes?
      if (isWaitMode && currentlyExpected.length > 0) {
        const missingNotes = currentlyExpected.filter(n => !activeNotesRef.current.includes(n));
        if (missingNotes.length > 0) {
          shouldPause = true; // Freeze time!
        }
      }

      // 3. Advance time only if playing and not paused by Wait Mode
      if (isPlaying && !shouldPause) {
        timeRef.current += deltaSeconds;
      }

      // Draw Background
      ctx.clearRect(0, 0, WATERFALL_WIDTH, WATERFALL_HEIGHT);
      ctx.fillStyle = '#1a1a1a'; 
      ctx.fillRect(0, 0, WATERFALL_WIDTH, WATERFALL_HEIGHT);

      // Draw Notes
      notes.forEach((note, index) => {
        const pos = NOTE_POSITIONS[note.name];
        if (!pos) return;

        const bottomY = (note.time - timeRef.current) * PIXELS_PER_SECOND;
        const noteHeight = note.duration * PIXELS_PER_SECOND;
        
        const isNoteActive = timeRef.current >= note.time && timeRef.current <= (note.time + note.duration);

        // --- AUDIO TRIGGER (Only play background audio if NOT in Wait Mode) ---
        // If Wait Mode is on, we expect YOU to play it, so we mute the background track for that note.
        if (audioEnabled && isPlaying && !isWaitMode) {
          if (isNoteActive && !playingNotesRef.current.has(index)) {
            playingNotesRef.current.add(index);
            playNote(note.name);
          } else if (!isNoteActive && playingNotesRef.current.has(index)) {
            playingNotesRef.current.delete(index);
            stopNote(note.name);
          }
        }

        // --- VISUAL DRAWING & SCORING COLORS ---
        if (bottomY <= WATERFALL_HEIGHT && bottomY + noteHeight >= 0) {
          let drawColor = pos.color; // Default blue/cyan

          // If the note crosses the bottom line, grade it!
          if (isNoteActive) {
            if (activeNotesRef.current.includes(note.name)) {
              drawColor = '#28a745'; // GREEN: You are playing it correctly!
            } else {
              drawColor = isWaitMode ? '#ffc107' : '#dc3545'; // ORANGE: Waiting for you | RED: You missed it!
            }
          }

          ctx.fillStyle = drawColor;
          const drawY = WATERFALL_HEIGHT - bottomY - noteHeight;
          
          ctx.fillRect(pos.left, drawY, pos.width, noteHeight);
          ctx.strokeStyle = 'rgba(0,0,0,0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(pos.left, drawY, pos.width, noteHeight);
        }
      });

      requestRef.current = requestAnimationFrame(draw);
    };

    requestRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(requestRef.current);
  }, [song, isPlaying, audioEnabled, notes, isWaitMode]);

  return (
    <canvas 
      ref={canvasRef}
      width={WATERFALL_WIDTH}
      height={WATERFALL_HEIGHT}
      style={{ 
        display: 'block', 
        border: '2px solid #333',
        borderBottom: '4px solid #ff4757', // Added a red "Playhead" line to the bottom
        borderRadius: '8px 8px 0 0',
        backgroundColor: '#1a1a1a'
      }}
    />
  );
}