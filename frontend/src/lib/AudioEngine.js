import * as Tone from 'tone';

const synth = new Tone.PolySynth(Tone.Synth, { 
  volume: -12,
  envelope: {
    attack: 0.02,
    decay: 0.1,
    sustain: 1,
    release: 0.05 // <--- Changed from 0.5 to 0.05! (Just enough to stop the pop)
  }
}).toDestination();

const activeVoices = new Set();

export const playNote = (note) => {
  if (!activeVoices.has(note)) {
    activeVoices.add(note);
    synth.triggerAttack(note);
  }
};

export const stopNote = (note) => {
  if (activeVoices.has(note)) {
    activeVoices.delete(note);
    synth.triggerRelease(note);
  }
};

export const startAudioContext = async () => {
  await Tone.start();
  console.log('Audio Context Started');
};