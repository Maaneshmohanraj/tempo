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

const KEYBOARD_MAP = {
  a: 'C3',
  w: 'C#3',
  s: 'D3',
  e: 'D#3',
  d: 'E3',
  f: 'F3',
  t: 'F#3',
  g: 'G3',
  y: 'G#3',
  h: 'A3',
  u: 'A#3',
  j: 'B3',
  k: 'C4',
  o: 'C#4',
  l: 'D4',
  p: 'D#4',
  ';': 'E4',
  "'": 'F4',
  ']': 'F#4',
  '\\': 'G4',
};

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

let GLOBAL_TIMELINE = [];

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
  const addCoachMessage = useStore((s) => s.addCoachMessage);
  const updateSkill = useStore((s) => s.updateSkill);
  const skills = useStore((s) => s.skills);

  const scrollWrapperRef = useRef(null);
  const exerciseStartRef = useRef(null);
  const lastPlayedAtRef = useRef(0);
  const phraseTimerRef = useRef(null);
  const wsRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const activeKeysRef = useRef({});

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
    lastPlayedAtRef.current = 0;
    GLOBAL_TIMELINE = [];

    if (phraseTimerRef.current) {
      clearTimeout(phraseTimerRef.current);
      phraseTimerRef.current = null;
    }
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
      let workingState = detectSkippedNotes({
        state: prevState,
        expectedNotes,
        playbackTimeSeconds: playedTimeSeconds,
        isWaitMode,
      });

      const { state: evaluatedState, result } = evaluatePlayedNote({
        state: workingState,
        expectedNote: expectedNotes[workingState.expectedIndex],
        playedNote: note,
        playedTimeSeconds,
        velocity,
        isWaitMode,
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

          <div className="kf-waterfall-wrapper" ref={scrollWrapperRef}>
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
            fullTimeline={GLOBAL_TIMELINE}
          />

          <SkillGraph />
        </div>
      </div>
    </div>
  );
}

export default App;