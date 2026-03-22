import * as Tone from 'tone';

// 1. We removed .toDestination() here so it ONLY flows into the reverb
const customSynth = new Tone.PolySynth(Tone.FMSynth, {
  harmonicity: 3.01,
  modulationIndex: 14,
  envelope: {
    attack: 0.02, // Slightly softened attack to prevent clicking
    decay: 0.2,
    sustain: 0.5,
    release: 1.2, // Lengthened release so mouse clicks ring out beautifully
  },
  modulation: {
    type: 'triangle',
  },
  modulationEnvelope: {
    attack: 0.01,
    decay: 0.5,
    sustain: 0.2,
    release: 0.1,
  },
});

// 2. The Reverb is the only thing connected to the speakers (Destination)
const reverb = new Tone.Reverb({
  decay: 4,
  preDelay: 0.01,
  wet: 0.3,
}).toDestination();

// 3. Chain them together: Synth -> Reverb -> Speakers
customSynth.connect(reverb);

export const playCustomNote = (note) => {
  customSynth.triggerAttack(note);
};

export const stopCustomNote = (note) => {
  customSynth.triggerRelease(note);
};