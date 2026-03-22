import React from 'react';
import { useStore } from '../lib/store';

const CAT_COLORS = {
  scales: { bg: 'rgba(0,245,212,0.12)', bar: '#00f5d4', text: '#00f5d4' },
  chords: { bg: 'rgba(108,92,231,0.12)', bar: '#a29bfe', text: '#a29bfe' },
  rhythm: { bg: 'rgba(254,202,87,0.12)', bar: '#feca57', text: '#feca57' },
  technique: { bg: 'rgba(255,107,107,0.12)', bar: '#ff6b6b', text: '#ff6b6b' },
  reading: { bg: 'rgba(72,152,248,0.12)', bar: '#4898f8', text: '#4898f8' },
  theory: { bg: 'rgba(232,134,196,0.12)', bar: '#e886c4', text: '#e886c4' },
};

export function SkillGraph() {
  const skills = useStore((s) => s.skills);

  return (
    <div className="kf-skills">
      <h4 className="kf-section-title">Skill Progress</h4>
      <div className="kf-skills-list">
        {skills.map((skill) => {
          const c = CAT_COLORS[skill.category] || CAT_COLORS.scales;
          const pct = Math.round(skill.mastery * 100);
          return (
            <div key={skill.id} className="kf-skill-row">
              <div className="kf-skill-info">
                <span className="kf-skill-name">{skill.name}</span>
                <span style={{ color: c.text, fontSize: 11, fontFamily: 'monospace' }}>{pct}%</span>
              </div>
              <div className="kf-skill-track" style={{ background: c.bg }}>
                <div className="kf-skill-fill" style={{ width: `${pct}%`, background: c.bar }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
