import React from 'react';
import { useStore } from '../lib/store';

export function Header({ midiReady, midiError, wsConnected }) {
  const mode = useStore((s) => s.mode);

  return (
    <header className="kf-header">
      <div className="kf-header-left">
        <div className="kf-logo">
          <span className="kf-logo-icon">T</span>
          {midiReady && <span className="kf-logo-dot" />}
        </div>
        <div>
          <h1 className="kf-title">Tempo</h1>
          <span className="kf-subtitle">Agentic Piano Learning</span>
        </div>
      </div>

      <div className="kf-header-center">
        <span className="kf-mode-badge">
          <span className="kf-pulse" />
          {mode} mode
        </span>
      </div>

      <div className="kf-header-right">
        <span className={`kf-status ${midiReady ? 'connected' : ''}`}>
          <span className="kf-status-dot" />
          {midiReady ? 'MIDI' : midiError || 'No MIDI'}
        </span>
        <span className={`kf-status ${wsConnected ? 'connected' : ''}`}>
          <span className="kf-status-dot" />
          {wsConnected ? 'Server' : 'Offline'}
        </span>
      </div>
    </header>
  );
}
