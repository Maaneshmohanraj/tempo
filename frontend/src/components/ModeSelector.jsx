import React from 'react';
import { useStore } from '../lib/store';

const MODES = [
  { id: 'guided', label: 'Guided', icon: '📖' },
  { id: 'freeplay', label: 'Free Play', icon: '🎹' },
  { id: 'jam', label: 'Jam', icon: '🎵' },
  { id: 'boss', label: 'Boss', icon: '⚔️' },
  { id: 'ear', label: 'Ear', icon: '👂' },
];

export function ModeSelector() {
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);

  return (
    <div className="kf-modes">
      {MODES.map((m) => (
        <button
          key={m.id}
          className={`kf-mode-pill ${mode === m.id ? 'active' : ''}`}
          onClick={() => setMode(m.id)}
        >
          <span>{m.icon}</span> {m.label}
        </button>
      ))}
    </div>
  );
}
