import React from 'react';

export function ScoreDisplay({ matcherState }) {
  const stats = matcherState?.sessionStats || {};
  const total = stats.totalNotes || 0;
  const correct = stats.correctNotes || 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  const grade = accuracy >= 95 ? 'S' : accuracy >= 85 ? 'A' : accuracy >= 70 ? 'B' : accuracy >= 55 ? 'C' : accuracy >= 40 ? 'D' : '—';

  const streakMult = stats.streak >= 50 ? '4×' : stats.streak >= 25 ? '3×' : stats.streak >= 10 ? '2×' : stats.streak >= 5 ? '1.5×' : '';

  const gradeClass =
    grade === 'S' ? 'gold' : grade === 'A' ? 'neon' : grade === 'B' ? 'accent' : grade === 'C' ? 'warm' : 'dim';

  return (
    <div className="kf-score-bar">
      <div className="kf-score-item">
        <span className="kf-score-label">Accuracy</span>
        <span className="kf-score-value neon">{total > 0 ? `${accuracy}%` : '—'}</span>
      </div>
      <div className="kf-score-item">
        <span className="kf-score-label">Streak</span>
        <span className="kf-score-value gold">
          {stats.streak || 0}
          {streakMult && <small className="kf-mult">{streakMult}</small>}
        </span>
      </div>
      <div className="kf-score-item">
        <span className="kf-score-label">Best</span>
        <span className="kf-score-value">{stats.bestStreak || 0}</span>
      </div>
      <div className="kf-score-item">
        <span className="kf-score-label">Notes</span>
        <span className="kf-score-value">{correct}/{total}</span>
      </div>
      <div className="kf-score-item">
        <span className="kf-score-label">Phrases</span>
        <span className="kf-score-value">{stats.phrasesCompleted || 0}</span>
      </div>
      <div className="kf-score-item">
        <span className="kf-score-label">Grade</span>
        <span className={`kf-score-value kf-grade ${gradeClass}`}>{grade}</span>
      </div>
    </div>
  );
}
