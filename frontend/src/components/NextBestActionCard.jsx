import React from 'react';

export function NextBestActionCard({ action, onApply }) {
  if (!action) return null;

  return (
    <div className="kf-agent-card">
      <div className="kf-agent-card-header">
        <div>
          <div className="kf-agent-eyebrow">Next Best Action</div>
          <h4 className="kf-agent-title">{action.title}</h4>
        </div>

        <div className={`kf-agent-pill ${action.tone || 'accent'}`}>
          {action.badge}
        </div>
      </div>

      <p className="kf-agent-copy">{action.description}</p>

      <div className="kf-agent-tags">
        {(action.tags || []).map((tag) => (
          <span key={tag} className="kf-agent-tag">
            {tag}
          </span>
        ))}
      </div>

      <div className="kf-agent-actions">
        <button className="kf-btn kf-btn-accent" onClick={() => onApply(action)}>
          {action.cta || 'Apply'}
        </button>
      </div>
    </div>
  );
}
