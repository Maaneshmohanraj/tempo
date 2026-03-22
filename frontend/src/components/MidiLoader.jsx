import React, { useState } from 'react';
import { Midi } from '@tonejs/midi';

export function MidiLoader({ onMidiLoaded }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setLoading(true);
    setError(null);

    try {
      const parsedSongs = await Promise.all(
        files.map(async (file) => {
          const arrayBuffer = await file.arrayBuffer();
          const parsedMidi = new Midi(arrayBuffer);

          return {
            id: `${file.name}-${file.size}-${file.lastModified}`,
            fileName: file.name,
            midi: parsedMidi,
          };
        })
      );

      onMidiLoaded(parsedSongs);
    } catch (err) {
      console.error('Error parsing MIDI file(s):', err);
      setError('Could not parse one or more MIDI files. Please try different files.');
    } finally {
      setLoading(false);
      event.target.value = '';
    }
  };

  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: '#fff',
        border: '2px dashed #ccc',
        borderRadius: '8px',
        marginTop: '2rem',
      }}
    >
      <h3>📄 Load Sheet Music (.mid)</h3>
      <p style={{ color: '#666', marginBottom: '1rem' }}>
        Upload one or more MIDI files to build your song library.
      </p>

      <input
        type="file"
        accept="audio/midi,.mid"
        multiple
        onChange={handleFileUpload}
        style={{ display: 'block', margin: '0 auto' }}
      />

      {loading && (
        <p style={{ color: '#007bff', fontWeight: 'bold', marginTop: '1rem' }}>
          Parsing MIDI files...
        </p>
      )}

      {error && (
        <p style={{ color: 'red', fontWeight: 'bold', marginTop: '1rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}