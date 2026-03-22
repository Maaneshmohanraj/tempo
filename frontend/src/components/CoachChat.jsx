import React, { useState, useEffect } from 'react';
import { useStore } from '../lib/store';

export function CoachChat({ wsRef, matcherState, songName, mode, fullTimeline }) {
  const [userMsg, setUserMsg] = useState("");
  // Assuming you have coachMessages in your Zustand store
  const messages = useStore((s) => s.coachMessages) || []; 

  // 1. Real-Time Chunks 
  useEffect(() => {
    const ws = wsRef?.current;
    const phrasesCompleted = matcherState?.sessionStats?.phrasesCompleted || 0;
    
    console.log(`Phrase completed! Total phrases so far: ${phrasesCompleted}`);

    if (phrasesCompleted > 0) {
      // Pull safely from our new fullTimeline prop
      const history = fullTimeline || [];
      const recentNotes = history.slice(-5);
      
      const recentErrors = recentNotes.filter(n => n.played !== n.expected || Math.abs(n.timingDeltaMs) > 150);

      if (recentErrors.length > 0) {
        const chunkPayload = {
          type: 'realtime_chunk',
          context: { song: songName || 'Unknown', mode: mode || 'guided' },
          recent_notes: recentNotes,
          error_count: recentErrors.length
        };
        
        console.log("🚀 PREPARING TO SEND REAL-TIME CHUNK:", chunkPayload);

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(chunkPayload));
        } else {
          console.warn("⚠️ Chunk generated, but Python server is not connected. Skipping send.");
        }
      }
    }
  }, [matcherState?.sessionStats?.phrasesCompleted, wsRef, songName, mode, fullTimeline]);

  // 2. Full Analysis / Standard Chat
  const sendToCoach = (isFullAnalysis = false) => {
    const ws = wsRef?.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn("⚠️ Cannot send message: WebSocket is not connected.");
      return;
    }

    const payload = {
      type: isFullAnalysis ? 'session_complete' : 'coach_request',
      message: isFullAnalysis ? "I just finished my session. Can you give me a full analysis of my performance?" : userMsg,
      context: { song: songName || 'Unknown', mode: mode || 'guided' },
      // Pull stats safely
      performance_summary: matcherState?.sessionStats || {},
      // Pull our bulletproof timeline!
      full_timeline: fullTimeline || []
    };

    console.log(`🚀 SENDING ${isFullAnalysis ? 'FULL SESSION' : 'CHAT'} TO BACKEND:`, payload);
    
    ws.send(JSON.stringify(payload));
    setUserMsg(""); // Clear input box
  };

  return (
    <div className="kf-coach-chat" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', border: '1px solid #ccc', borderRadius: '8px' }}>
      <h4 className="kf-section-title">AI Coach</h4>
      
      {/* Messages Area */}
      <div className="kf-chat-messages" style={{ maxHeight: '200px', overflowY: 'auto', background: '#f9f9f9', padding: '10px', borderRadius: '4px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '8px', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
            <span style={{ fontWeight: 'bold', color: msg.role === 'user' ? '#007bff' : '#28a745' }}>
              {msg.role === 'user' ? 'You: ' : 'Coach: '}
            </span>
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input Area */}
      <div style={{ display: 'flex', gap: '5px' }}>
        <input 
          type="text" 
          value={userMsg} 
          onChange={(e) => setUserMsg(e.target.value)}
          placeholder="Ask for tips..."
          style={{ flexGrow: 1, padding: '5px' }}
          onKeyDown={(e) => e.key === 'Enter' && sendToCoach(false)}
        />
        <button onClick={() => sendToCoach(false)} className="kf-btn kf-btn-accent">Send</button>
      </div>
      
      {/* Full Analysis Button */}
      <button 
        onClick={() => sendToCoach(true)} 
        className="kf-btn kf-btn-purple" 
        style={{ width: '100%' }}
      >
        Get Full Analysis
      </button>
    </div>
  );
}