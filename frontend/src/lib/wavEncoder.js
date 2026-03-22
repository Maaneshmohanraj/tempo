// src/lib/wavEncoder.js

export async function convertWebmToWav(webmBlob) {
  // Use OfflineAudioContext to safely decode audio data in the background 
  // without browser security (like Safari's) blocking it
  const audioContext = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 2, 44100);
  
  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44;
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels = [];
  let sample = 0;
  let offset = 0;
  let pos = 0;

  // Write WAV Header
  const setUint16 = (data) => { view.setUint16(pos, data, true); pos += 2; };
  const setUint32 = (data) => { view.setUint32(pos, data, true); pos += 4; };
  const writeString = (str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(pos, str.charCodeAt(i)); pos++;
    }
  };

  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');
  writeString('fmt ');
  setUint32(16);
  setUint16(1); // PCM format
  setUint16(numOfChan);
  setUint32(audioBuffer.sampleRate);
  setUint32(audioBuffer.sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);
  writeString('data');
  setUint32(length - pos - 4);

  // Write interleaved audio data
  for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  while (pos < length) {
    for (let i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}