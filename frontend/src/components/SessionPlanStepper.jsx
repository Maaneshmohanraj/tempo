import React from 'react';

export function SessionPlanStepper({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <div className="kf-agent-card kf-session-stepper">
      <div className="kf-agent-eyebrow">Today's Session</div>
      <h4 className="kf-agent-title">Practice Journey</h4>

      <div className="kf-session-steps">
        {steps.map((step) => (
          <div key={step.id} className={`kf-session-step ${step.status}`}>
            <div className={`kf-session-dot ${step.status}`}>
              {step.status === 'done' ? '✓' : step.order}
            </div>

            <div className="kf-session-body">
              <div className="kf-session-row">
                <div className="kf-session-name">{step.title}</div>
                <div className={`kf-session-status ${step.status}`}>
                  {step.status === 'done'
                    ? 'Done'
                    : step.status === 'current'
                    ? 'Now'
                    : 'Next'}
                </div>
              </div>

              <div className="kf-session-copy">{step.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
