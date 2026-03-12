/**
 * Chord Audio Module
 * Web Audio API-based chord sound playback with instrument-specific timbres
 */
const ChordAudio = (() => {
  let audioCtx = null;
  let isPlaying = false;
  let currentInstrument = 'piano'; // 'piano', 'guitar', 'ukulele'

  // Note frequencies (A4 = 440Hz)
  const NOTE_FREQ = {
    'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
    'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88,
  };

  function getAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioCtx;
  }

  function noteFrequency(noteName, octave) {
    const normalized = MusicTheory.normalizeNote(noteName);
    const baseFreq = NOTE_FREQ[normalized];
    if (!baseFreq) return 440;
    return baseFreq * Math.pow(2, octave - 4);
  }

  function setInstrument(instrument) {
    currentInstrument = instrument;
  }

  function getInstrument() {
    return currentInstrument;
  }

  // =========================================
  // Instrument-specific note synthesis
  // =========================================

  /**
   * Piano: bright attack, long sustain, gradual decay
   * Uses sine + harmonics (2nd, 3rd, 5th partial) for rich tone
   */
  function playPianoNote(ctx, dest, freq, now, duration) {
    const masterGain = ctx.createGain();
    masterGain.connect(dest);

    // Piano ADSR: fast attack, slight decay, sustain, release
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.25, now + 0.01);  // sharp attack
    masterGain.gain.exponentialRampToValueAtTime(0.15, now + 0.3); // decay
    masterGain.gain.setValueAtTime(0.15, now + duration - 0.4);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Fundamental (sine)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, now);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.6, now);
    osc1.connect(g1);
    g1.connect(masterGain);

    // 2nd harmonic
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, now);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.2, now);
    g2.gain.exponentialRampToValueAtTime(0.05, now + 0.5);
    osc2.connect(g2);
    g2.connect(masterGain);

    // 3rd harmonic (adds brightness)
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3, now);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.1, now);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc3.connect(g3);
    g3.connect(masterGain);

    // 5th harmonic (subtle shimmer)
    const osc4 = ctx.createOscillator();
    osc4.type = 'sine';
    osc4.frequency.setValueAtTime(freq * 5, now);
    const g4 = ctx.createGain();
    g4.gain.setValueAtTime(0.03, now);
    g4.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc4.connect(g4);
    g4.connect(masterGain);

    [osc1, osc2, osc3, osc4].forEach(o => { o.start(now); o.stop(now + duration); });
  }

  /**
   * Guitar: plucked string - sharp attack, quick decay, warm tone
   * Uses sawtooth filtered through lowpass + harmonics decay
   */
  function playGuitarNote(ctx, dest, freq, now, duration) {
    const masterGain = ctx.createGain();
    masterGain.connect(dest);

    // Guitar ADSR: very fast attack, quick decay, low sustain
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.3, now + 0.005);  // pluck attack
    masterGain.gain.exponentialRampToValueAtTime(0.08, now + 0.15); // quick decay
    masterGain.gain.exponentialRampToValueAtTime(0.04, now + duration * 0.6);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Lowpass filter (guitar body resonance)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(800, now + duration * 0.5); // tone darkens
    filter.Q.setValueAtTime(1.5, now);
    filter.connect(masterGain);

    // Sawtooth (rich harmonics, like a string)
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, now);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.4, now);
    osc1.connect(g1);
    g1.connect(filter);

    // Triangle (adds warmth)
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq, now);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.4, now);
    osc2.connect(g2);
    g2.connect(filter);

    // Slight detuning for realism
    const osc3 = ctx.createOscillator();
    osc3.type = 'sawtooth';
    osc3.frequency.setValueAtTime(freq * 1.002, now); // slight detune
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.15, now);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc3.connect(g3);
    g3.connect(filter);

    [osc1, osc2, osc3].forEach(o => { o.start(now); o.stop(now + duration); });
  }

  /**
   * Ukulele: bright plucked nylon string - short, bright, happy tone
   * Higher register, shorter sustain, brighter filter
   */
  function playUkuleleNote(ctx, dest, freq, now, duration) {
    const masterGain = ctx.createGain();
    masterGain.connect(dest);

    // Ukulele ADSR: fast attack, medium-quick decay, short sustain
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.25, now + 0.003); // snap attack
    masterGain.gain.exponentialRampToValueAtTime(0.1, now + 0.1);
    masterGain.gain.exponentialRampToValueAtTime(0.03, now + duration * 0.5);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Brighter lowpass (nylon string, small body)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(4500, now);
    filter.frequency.exponentialRampToValueAtTime(1500, now + duration * 0.4);
    filter.Q.setValueAtTime(2, now);
    filter.connect(masterGain);

    // Triangle (nylon-like, softer harmonics)
    const osc1 = ctx.createOscillator();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(freq, now);
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.5, now);
    osc1.connect(g1);
    g1.connect(filter);

    // Sine fundamental
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq, now);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.3, now);
    osc2.connect(g2);
    g2.connect(filter);

    // High harmonic for brightness
    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 2, now);
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.15, now);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    osc3.connect(g3);
    g3.connect(filter);

    [osc1, osc2, osc3].forEach(o => { o.start(now); o.stop(now + duration); });
  }

  // =========================================
  // Chord playback
  // =========================================

  /**
   * Play a single chord with the current instrument timbre
   */
  function playChord(chordName, duration = 1.5, instrument) {
    const inst = instrument || currentInstrument;
    return new Promise((resolve) => {
      const ctx = getAudioContext();
      const notes = MusicTheory.getChordNotes(chordName);
      if (notes.length === 0) { resolve(); return; }

      const now = ctx.currentTime;

      // Instrument-specific octave range
      const baseOctave = inst === 'ukulele' ? 4 : 3;

      notes.forEach((note, i) => {
        let octave = baseOctave;
        if (i > 0) {
          const prevIdx = MusicTheory.noteIndex(notes[i - 1]);
          const currIdx = MusicTheory.noteIndex(note);
          if (currIdx <= prevIdx) octave++;
        }

        const freq = noteFrequency(note, octave);

        // Strum effect: slight delay between notes for guitar/ukulele
        const strumDelay = (inst === 'guitar' || inst === 'ukulele') ? i * 0.03 : 0;
        const noteStart = now + strumDelay;

        switch (inst) {
          case 'piano':
            playPianoNote(ctx, ctx.destination, freq, noteStart, duration);
            break;
          case 'guitar':
            playGuitarNote(ctx, ctx.destination, freq, noteStart, duration);
            break;
          case 'ukulele':
            playUkuleleNote(ctx, ctx.destination, freq, noteStart, duration);
            break;
          default:
            playPianoNote(ctx, ctx.destination, freq, noteStart, duration);
        }
      });

      setTimeout(resolve, duration * 1000);
    });
  }

  /**
   * Play multiple chords in sequence
   */
  async function playChordSequence(chordNames, interval = 1.8, onChordStart, instrument) {
    if (isPlaying) return;
    isPlaying = true;

    for (let i = 0; i < chordNames.length; i++) {
      if (!isPlaying) break;
      if (onChordStart) onChordStart(chordNames[i], i);
      await playChord(chordNames[i], interval - 0.2, instrument);
      await new Promise(r => setTimeout(r, 200));
    }

    isPlaying = false;
  }

  function stopPlayback() {
    isPlaying = false;
  }

  function getIsPlaying() {
    return isPlaying;
  }

  return {
    playChord,
    playChordSequence,
    stopPlayback,
    getIsPlaying,
    setInstrument,
    getInstrument,
  };
})();
