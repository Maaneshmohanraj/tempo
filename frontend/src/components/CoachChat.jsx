import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';

export function CoachChat({
  wsRef,
  matcherState,
  songName,
  mode,
  fullTimeline,
  onRequestFullAnalysis,
}) {
  const [userMsg, setUserMsg] = useState('');
  const streamBufferRef = useRef('');

  const messages = useStore((s) => s.coachMessages) || [];
  const addCoachMessage = useStore((s) => s.addCoachMessage);
  const replaceLastCoachMessage = useStore((s) => s.replaceLastCoachMessage);
  const isCoachThinking = useStore((s) => s.isCoachThinking);
  const setCoachThinking = useStore((s) => s.setCoachThinking);

  useEffect(() => {
    if (
      wsRef?.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const ws = new WebSocket('ws://localhost:8000/ws');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);

        if (payload.action === 'coach_chunk') {
          if (!streamBufferRef.current) {
            streamBufferRef.current = payload.text || '';
            addCoachMessage({
              role: 'coach',
              content: streamBufferRef.current,
            });
          } else {
            streamBufferRef.current += payload.text || '';
            replaceLastCoachMessage(streamBufferRef.current);
          }
          setCoachThinking(false);
          return;
        }

        if (payload.action === 'coach_response') {
          addCoachMessage({
            role: 'coach',
            content: payload.text || 'Coach responded.',
          });
          streamBufferRef.current = '';
          setCoachThinking(false);
          return;
        }

        if (payload.action === 'coach_done') {
          streamBufferRef.current = '';
          setCoachThinking(false);
        }
      } catch (error) {
        console.error('Coach socket parse error:', error);
        setCoachThinking(false);
      }
    };

    ws.onerror = () => {
      setCoachThinking(false);
    };

    ws.onclose = () => {
      setCoachThinking(false);
    };

    return () => {
      if (wsRef?.current === ws) {
        ws.close();
        wsRef.current = null;
      }
    };
  }, [wsRef, addCoachMessage, replaceLastCoachMessage, setCoachThinking]);

  useEffect(() => {
    const ws = wsRef?.current;
    const phrasesCompleted = matcherState?.sessionStats?.phrasesCompleted || 0;

    if (phrasesCompleted > 0) {
      const history = fullTimeline || [];
      const recentNotes = history.slice(-5);
      const recentErrors = recentNotes.filter(
        (n) => n.played !== n.expected || Math.abs(n.timingDeltaMs || 0) > 150
      );

      if (recentErrors.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'realtime_chunk',
            context: {
              song: songName || 'Unknown',
              mode: mode || 'guided',
            },
            recent_notes: recentNotes,
            error_count: recentErrors.length,
          })
        );
      }
    }
  }, [matcherState?.sessionStats?.phrasesCompleted, wsRef, songName, mode, fullTimeline]);

  const sendToCoach = (isFullAnalysis = false) => {
    const ws = wsRef?.current;
    const trimmed = userMsg.trim();
    const text = isFullAnalysis
      ? 'I just finished my session. Can you give me a full analysis of my performance?'
      : trimmed;

    if (!text) return;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      addCoachMessage({
        role: 'system',
        content: 'Coach socket is not connected. Start the backend to use AI Coach.',
      });
      return;
    }

    addCoachMessage({
      role: 'user',
      content: isFullAnalysis ? 'Give me a full analysis of my performance.' : text,
    });

    setCoachThinking(true);
    streamBufferRef.current = '';

    if (isFullAnalysis) {
      onRequestFullAnalysis?.();
    }

    ws.send(
      JSON.stringify({
        type: isFullAnalysis ? 'session_complete' : 'coach_request',
        message: text,
        context: {
          song: songName || 'Unknown',
          mode: mode || 'guided',
        },
        performance_summary: matcherState?.sessionStats || {},
        full_timeline: fullTimeline || [],
      })
    );

    setUserMsg('');
  };

  return (
    <div className="kf-coach">
      <div className="kf-coach-header">
        <div className="kf-coach-avatar">AI</div>

        <div>
          <strong>AI Coach</strong>
          <span className="kf-coach-status">
            {songName ? `Watching: ${songName}` : 'Ready for feedback'}
          </span>
        </div>

        <button
          onClick={() => sendToCoach(true)}
          className="kf-btn-sm kf-btn-purple"
        >
          Full Analysis
        </button>
      </div>

      <div className="kf-coach-messages">
        {!messages.length && !isCoachThinking && (
          <div className="kf-coach-empty">
            <p>Play a few notes, then ask for feedback.</p>
            <p className="dim">The coach will react to timing, pitch, and streaks.</p>
          </div>
        )}

        {messages.map((msg) => {
          const bubbleClass =
            msg.role === 'user'
              ? 'kf-msg-bubble-learner'
              : msg.role === 'system'
                ? 'kf-msg-bubble-system'
                : 'kf-msg-bubble-coach';

          const rowClass =
            msg.role === 'user'
              ? 'kf-msg-learner'
              : msg.role === 'system'
                ? 'kf-msg-system'
                : 'kf-msg-coach';

          return (
            <div key={msg.id} className={`kf-msg ${rowClass}`}>
              <div className={`kf-msg-bubble ${bubbleClass}`}>{msg.content}</div>
            </div>
          );
        })}

        {isCoachThinking && (
          <div className="kf-msg kf-msg-coach">
            <div className="kf-msg-bubble kf-msg-bubble-coach">
              <div className="kf-dots">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="kf-coach-input">
        <input
          type="text"
          value={userMsg}
          onChange={(e) => setUserMsg(e.target.value)}
          placeholder="Ask for tips..."
          onKeyDown={(e) => e.key === 'Enter' && sendToCoach(false)}
        />
        <button onClick={() => sendToCoach(false)} className="kf-btn kf-btn-accent">
          Send
        </button>
      </div>
    </div>
  );
}