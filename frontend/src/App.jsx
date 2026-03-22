import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as Tone from 'tone';
import { Midi } from '@tonejs/midi';
import { useMidi } from './hooks/useMidi';
import { startAudioContext, playNote, stopNote } from './lib/AudioEngine';
import { PianoKeyboard } from './components/PianoKeyboard';
import { MidiLoader } from './components/MidiLoader';
import { Waterfall } from './components/Waterfall';
import { Header } from './components/Header';
import { CoachChat } from './components/CoachChat';
import { ScoreDisplay } from './components/ScoreDisplay';
import { SkillGraph } from './components/SkillGraph';
import { ModeSelector } from './components/ModeSelector';
import { useStore } from './lib/store';
import {
  buildExpectedSequenceFromSong,
  createMatcherState,
  detectSkippedNotes,
  evaluatePlayedNote,
} from './lib/patternMatcher';
import { convertWebmToWav } from './lib/wavEncoder';
import './App.css';

const normalizeMidiData = (parsedMidi) => {
  const flatToSharp = { Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#' };

  parsedMidi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const match = note.name.match(/^([A-G](?:#|b)?)(-?\d+)$/);
      if (!match) return;

      const [, baseNote, octave] = match;
      if (flatToSharp[baseNote]) {
        note.name = `${flatToSharp[baseNote]}${octave}`;
      }
    });
  });

  return parsedMidi;
};

const getAccuracy = (stats) => {
  if (!stats || !stats.totalNotes) return 0;
  return stats.correctNotes / stats.totalNotes;
};

const getErrorBuckets = (stats) => {
  const errors = stats?.totalErrorsByType || {};

  const pitch =
    (errors.near_miss || 0) +
    (errors.far_miss || 0) +
    (errors.skipped_note || 0);

  const timing =
    (errors.timing_rush || 0) +
    (errors.timing_lag || 0);

  const dynamics =
    (errors.velocity_high || 0) +
    (errors.velocity_low || 0);

  return { pitch, timing, dynamics };
};

const buildAdaptiveAction = (matcherState, songName) => {
  const stats = matcherState?.sessionStats || {};
  const accuracy = getAccuracy(stats);
  const { pitch, timing, dynamics } = getErrorBuckets(stats);

  if ((stats.totalNotes || 0) < 8) {
    return {
      id: 'warmup_wait',
      badge: 'Warmup',
      tone: 'accent',
      title: 'Start with a clean warmup',
      description:
        'Play 8 accurate notes first so your hands settle before a full run.',
      cta: 'Use Wait Mode',
      tags: ['Low pressure', 'Clean notes'],
    };
  }

  if (pitch >= timing && pitch >= dynamics && pitch >= 3) {
    return {
      id: 'pitch_repair',
      badge: 'Pitch Focus',
      tone: 'warm',
      title: 'Repair note accuracy',
      description: `Most mistakes in ${songName || 'this song'} are pitch-related. Slow down and replay one phrase carefully.`,
      cta: 'Fix pitch first',
      tags: [`${pitch} pitch errors`, 'One phrase', 'Slow pass'],
    };
  }

  if (timing >= pitch && timing >= dynamics && timing >= 3) {
    return {
      id: 'timing_reset',
      badge: 'Timing Focus',
      tone: 'gold',
      title: 'Do a rhythm reset',
      description:
        'Your biggest issue right now is timing drift. Replay a short phrase with cleaner spacing.',
      cta: 'Run timing drill',
      tags: [`${timing} timing errors`, 'Pulse', 'Control'],
    };
  }

  if (dynamics >= 3) {
    return {
      id: 'dynamics_pass',
      badge: 'Touch Focus',
      tone: 'neon',
      title: 'Smooth out your dynamics',
      description:
        'The notes are mostly right, but the touch is uneven. Aim for softer, more even volume.',
      cta: 'Do dynamics pass',
      tags: [`${dynamics} touch errors`, 'Control', 'Consistency'],
    };
  }

  if (accuracy >= 0.85 && (stats.bestStreak || 0) >= 10) {
    return {
      id: 'full_run',
      badge: 'Confidence Push',
      tone: 'neon',
      title: 'Go for a full run',
      description:
        'Your streak and accuracy look strong. Turn Wait Mode off and try a continuous performance.',
      cta: 'Play full run',
      tags: [`${Math.round(accuracy * 100)}% accuracy`, 'Momentum', 'Performance'],
    };
  }

  return {
    id: 'retry_phrase',
    badge: 'Keep Going',
    tone: 'accent',
    title: 'Retry the current phrase',
    description:
      'You are close. Replay the same phrase one more time before changing strategy.',
    cta: 'Retry phrase',
    tags: ['One more pass', 'Stay focused'],
  };
};

const buildSessionPlan = (matcherState, songName, hasReview) => {
  const stats = matcherState?.sessionStats || {};
  const accuracy = getAccuracy(stats);

  const warmupDone = (stats.bestStreak || 0) >= 8 || (stats.correctNotes || 0) >= 8;
  const focusDone =
    warmupDone &&
    (((stats.phrasesCompleted || 0) >= 1) || ((stats.totalNotes || 0) >= 12));
  const songDone = (stats.totalNotes || 0) >= 20 && accuracy >= 0.75;
  const reviewDone = hasReview;

  const steps = [
    {
      id: 'warmup',
      order: 1,
      title: 'Warmup',
      description: 'Land 8 clean notes to settle timing and confidence.',
      done: warmupDone,
    },
    {
      id: 'focus',
      order: 2,
      title: 'Focus Drill',
      description: 'Follow the agent recommendation for one clean phrase.',
      done: focusDone,
    },
    {
      id: 'song',
      order: 3,
      title: songName ? `Song Run · ${songName}` : 'Song Run',
      description: 'Aim for 75%+ accuracy over a longer run.',
      done: songDone,
    },
    {
      id: 'review',
      order: 4,
      title: 'Review',
      description: 'Ask the coach for a summary and the next target.',
      done: reviewDone,
    },
  ];

  const currentStepId = steps.find((step) => !step.done)?.id;

  return steps.map((step) => ({
    ...step,
    status: step.done ? 'done' : step.id === currentStepId ? 'current' : 'upcoming',
  }));
};

function SessionPlanStepper({ steps = [] }) {
  if (!steps.length) return null;

  return (
    <div className="kf-agent-card kf-session-stepper">
      <div className="kf-agent-eyebrow">Today&apos;s Session</div>
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

function NextBestActionCard({ action, onApply }) {
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

function App() {
  const [localNotes, setLocalNotes] = useState({});
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [songLibrary, setSongLibrary] = useState([]);
  const [externalLibrary, setExternalLibrary] = useState([]);
  const [currentSongIndex, setCurrentSongIndex] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [isWaitMode, setIsWaitMode] = useState(false);
  const [expectedNotes, setExpectedNotes] = useState([]);
  const [matcherState, setMatcherState] = useState(createMatcherState());
  const [noteFeedback, setNoteFeedback] = useState({});
  const [wsConnected, setWsConnected] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [isGeneratingDrums, setIsGeneratingDrums] = useState(false);
  const [mixedTrackUrl, setMixedTrackUrl] = useState(null);
  const [isLoadingSong, setIsLoadingSong] = useState(false);

  const featuredSongs = [
    {
      title: 'Happy Birthday',
      path: '/happy-birthday.mid',
    },
  ];

  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const addCoachMessage = useStore((s) => s.addCoachMessage);
  const coachMessages = useStore((s) => s.coachMessages);

  const exerciseStartRef = useRef(null);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  const targetSong =
    currentSongIndex !== null ? songLibrary[currentSongIndex]?.midi ?? null : null;

  const currentSongName =
    currentSongIndex !== null ? songLibrary[currentSongIndex]?.name ?? null : null;

  useEffect(() => {
    fetch('/songs.json')
      .then((res) => res.json())
      .then((data) => setExternalLibrary(data))
      .catch((err) =>
        console.error('Could not load songs.json from public folder:', err)
      );
  }, []);

  useEffect(() => {
    const checkWs = setInterval(() => {
      setWsConnected(wsRef.current?.readyState === WebSocket.OPEN);
    }, 2000);

    return () => clearInterval(checkWs);
  }, []);

  const resetMatcher = () => {
    setMatcherState(createMatcherState());
    setNoteFeedback({});
    exerciseStartRef.current = null;
    setResetKey((prev) => prev + 1);
  };

  const addSongToLibraryAndSelect = ({ name, midi, id }) => {
    const cleanedMidi = normalizeMidiData(midi);

    const newSong = {
      name,
      midi: cleanedMidi,
      id,
    };

    setSongLibrary((prev) => {
      const filtered = prev.filter((song) => song.id !== id);
      return [newSong, ...filtered];
    });

    setCurrentSongIndex(0);
    setIsPlaying(false);
    resetMatcher();
  };

  const handleLocalSongSelect = async (name, publicPath) => {
    if (!publicPath) return;

    setIsLoadingSong(true);

    try {
      const midi = await Midi.fromUrl(publicPath);

      addSongToLibraryAndSelect({
        name,
        midi,
        id: `local-${publicPath}`,
      });
    } catch (err) {
      console.error('Error loading local MIDI:', err);
      alert('Could not load the local MIDI file.');
    } finally {
      setIsLoadingSong(false);
    }
  };

  const handleExternalSongSelect = async (url) => {
    if (!url) return;

    setIsLoadingSong(true);

    try {
      const finalUrl = url.startsWith('/')
        ? url
        : `http://localhost:8000/api/proxy-midi?url=${encodeURIComponent(url)}`;

      const midi = await Midi.fromUrl(finalUrl);
      const songTitle =
        externalLibrary.find((song) => song.url === url)?.title || 'Remote Song';

      addSongToLibraryAndSelect({
        name: songTitle,
        midi,
        id: `song-${url}`,
      });
    } catch (err) {
      console.error('Error loading song:', err);
      alert('Could not load the MIDI file.');
    } finally {
      setIsLoadingSong(false);
    }
  };

  const initAudio = async () => {
    if (!audioEnabled) {
      await startAudioContext();
      setAudioEnabled(true);
    }
  };

  const startRecording = async () => {
    await initAudio();

    try {
      const dest = Tone.getContext().rawContext.createMediaStreamDestination();
      Tone.getDestination().connect(dest);

      const options = { mimeType: 'audio/webm;codecs=opus' };
      mediaRecorderRef.current = new MediaRecorder(dest.stream, options);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        });

        if (audioBlob.size > 1000) {
          generateDrums(audioBlob);
        }
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);

      if (!isPlaying) {
        setIsPlaying(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setIsPlaying(false);
  };

  const generateDrums = async (audioBlob) => {
    setIsGeneratingDrums(true);
    setMixedTrackUrl(null);

    try {
      const wavBlob = await convertWebmToWav(audioBlob);
      const formData = new FormData();
      formData.append('user_audio', wavBlob, 'user_performance.wav');

      const response = await fetch(
        'http://localhost:8000/api/generate-backing-track',
        {
          method: 'POST',
          body: formData,
        }
      );

      const returnedBlob = await response.blob();
      setMixedTrackUrl(URL.createObjectURL(returnedBlob));
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingDrums(false);
    }
  };

  const handleMatchedNote = (note, velocity = 80) => {
    if (!expectedNotes.length || (isWaitMode && !isPlaying)) return;

    if (!exerciseStartRef.current) {
      exerciseStartRef.current = performance.now();
    }

    const playedTimeSeconds =
      (performance.now() - exerciseStartRef.current) / 1000;

    setMatcherState((prevState) => {
      const workingState = detectSkippedNotes({
        state: prevState,
        expectedNotes,
        playbackTimeSeconds: playedTimeSeconds,
      });

      const { state: evaluatedState, result } = evaluatePlayedNote({
        state: workingState,
        expectedNote: expectedNotes[workingState.expectedIndex],
        playedNote: note,
        playedTimeSeconds,
        velocity,
      });

      setNoteFeedback((prev) => ({
        ...prev,
        [note]: {
          type: result.feedbackType,
          label: result.feedbackType.toUpperCase(),
        },
      }));

      setTimeout(() => {
        setNoteFeedback((prev) => {
          const next = { ...prev };
          delete next[note];
          return next;
        });
      }, 400);

      return evaluatedState;
    });
  };

  const { activeNotes: midiNotes, error: midiError } = useMidi({
    onNoteEvent: (event) => {
      if (event.type === 'note_on') {
        playNote(event.note);
        handleMatchedNote(event.note, event.velocity);
      } else if (event.type === 'note_off') {
        stopNote(event.note);
      }
    },
  });

  const handleMidiLoaded = (songs) => {
    const cleaned = songs.map((song) => ({
      ...song,
      midi: normalizeMidiData(song.midi),
      name: song.fileName.replace('.mid', ''),
    }));

    setSongLibrary((prev) => {
      const cleanedIds = new Set(cleaned.map((song) => song.id));
      const remaining = prev.filter((song) => !cleanedIds.has(song.id));
      return [...cleaned, ...remaining];
    });

    setCurrentSongIndex(0);
    setIsPlaying(false);
    resetMatcher();
  };

  useEffect(() => {
    if (!targetSong) {
      setExpectedNotes([]);
      resetMatcher();
      return;
    }

    setExpectedNotes(buildExpectedSequenceFromSong(targetSong));
    resetMatcher();
  }, [targetSong]);

  const adaptiveAction = useMemo(
    () => buildAdaptiveAction(matcherState, currentSongName),
    [matcherState, currentSongName]
  );

  const sessionPlan = useMemo(
    () => buildSessionPlan(matcherState, currentSongName, coachMessages.length > 0),
    [matcherState, currentSongName, coachMessages.length]
  );

  const applyAdaptiveAction = async (action) => {
    if (!action) return;

    switch (action.id) {
      case 'warmup_wait':
      case 'pitch_repair':
      case 'timing_reset':
        setMode('guided');
        setIsWaitMode(true);
        setIsPlaying(false);
        break;

      case 'dynamics_pass':
        setMode('guided');
        setIsWaitMode(false);
        setIsPlaying(false);
        break;

      case 'full_run':
        setMode('guided');
        await initAudio();
        setIsWaitMode(false);
        setIsPlaying(true);
        break;

      case 'retry_phrase':
      default:
        setIsPlaying(false);
        break;
    }

    addCoachMessage({
      role: 'system',
      content: `Agent focus applied: ${action.title}`,
    });
  };

  const allActiveNotes = useMemo(
    () => [...Object.keys(localNotes), ...Object.keys(midiNotes)],
    [localNotes, midiNotes]
  );

  return (
    <div className="kf-app">
      <Header
        midiReady={!!midiNotes}
        midiError={midiError}
        wsConnected={wsConnected}
      />

      <div className="kf-main">
        <div className="kf-play-area">
          <ScoreDisplay matcherState={matcherState} />

          <div className="kf-waterfall-wrapper">
            <div className="kf-waterfall-inner">
              <Waterfall
                song={targetSong}
                isPlaying={isPlaying}
                onReset={resetKey}
                audioEnabled={audioEnabled}
                activeNotes={allActiveNotes}
                isWaitMode={isWaitMode}
              />

              <PianoKeyboard
                activeNotes={allActiveNotes}
                noteFeedback={noteFeedback}
                onPlayNote={async (n) => {
                  await initAudio();
                  playNote(n);
                  handleMatchedNote(n);
                  setLocalNotes((prev) => ({ ...prev, [n]: true }));
                }}
                onStopNote={(n) => {
                  stopNote(n);
                  setLocalNotes((prev) => {
                    const next = { ...prev };
                    delete next[n];
                    return next;
                  });
                }}
              />
            </div>
          </div>

          <div className="kf-controls">
            <div className="kf-controls-row">
              <button
                className="kf-btn kf-btn-accent"
                onClick={async () => {
                  await initAudio();
                  setIsPlaying(!isPlaying);
                }}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>

              <button
                className={`kf-btn ${isWaitMode ? 'kf-btn-purple' : 'kf-btn-outline'}`}
                onClick={() => setIsWaitMode(!isWaitMode)}
              >
                Wait Mode: {isWaitMode ? 'ON' : 'OFF'}
              </button>

              <button
                className={`kf-btn ${isRecording ? 'kf-btn-warn' : 'kf-btn-outline'}`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                {isRecording ? '⏹ Stop' : '⏺ Record + AI Drums'}
              </button>
            </div>

            {currentSongName && (
              <div className="kf-now-playing">
                <span className="kf-np-label">Current Song</span>
                <span className="kf-np-title">{currentSongName}</span>
              </div>
            )}

            {isGeneratingDrums && (
              <div className="kf-loading-status">🥁 Generating Beat...</div>
            )}

            {mixedTrackUrl && (
              <audio controls src={mixedTrackUrl} className="kf-audio-player" />
            )}
          </div>
        </div>

        <div className="kf-sidebar">
          <ModeSelector />

          <div className="kf-agent-stack">
            <SessionPlanStepper steps={sessionPlan} />
            <NextBestActionCard
              action={adaptiveAction}
              onApply={applyAdaptiveAction}
            />
          </div>

          <div className="kf-song-library">
            <h4 className="kf-section-title">Song Library</h4>

            <div className="kf-library-block">
              <div className="kf-library-label">Happy Birthday Song</div>

              {featuredSongs.map((song) => (
                <button
                  key={song.path}
                  className="kf-song-item"
                  onClick={() => handleLocalSongSelect(song.title, song.path)}
                  disabled={isLoadingSong}
                >
                  <div className="kf-song-name">{song.title}</div>
                  <div className="kf-song-meta">Local MIDI file</div>
                </button>
              ))}
            </div>

            <div className="kf-library-block">
              <div className="kf-library-label">Suggested Songs</div>

              <select
                className="kf-select"
                defaultValue=""
                onChange={(e) => {
                  const selectedUrl = e.target.value;
                  handleExternalSongSelect(selectedUrl);
                  e.target.value = '';
                }}
                disabled={isLoadingSong}
              >
                <option value="">-- Choose a Song --</option>
                {externalLibrary.map((song, index) => (
                  <option key={`${song.title}-${index}`} value={song.url}>
                    {song.title}
                  </option>
                ))}
              </select>

              {isLoadingSong && (
                <div className="kf-tiny-loading">Fetching MIDI...</div>
              )}
            </div>

            <div className="kf-library-block">
              <div className="kf-library-label">Choose Files</div>
              <MidiLoader onMidiLoaded={handleMidiLoaded} />
            </div>

            {!!songLibrary.length && (
              <div className="kf-library-block">
                <div className="kf-library-label">Loaded Songs</div>

                <div className="kf-song-list">
                  {songLibrary.map((song, idx) => (
                    <button
                      key={song.id || idx}
                      className={`kf-song-item ${currentSongIndex === idx ? 'active' : ''
                        }`}
                      onClick={() => {
                        setCurrentSongIndex(idx);
                        setIsPlaying(false);
                        resetMatcher();
                      }}
                    >
                      <div className="kf-song-name">{song.name}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <CoachChat
            wsRef={wsRef}
            matcherState={matcherState}
            songName={currentSongName}
            mode={mode}
            fullTimeline={matcherState?.fullHistory || []}
          />

          <SkillGraph />
        </div>
      </div>
    </div>
  );
}

export default App;