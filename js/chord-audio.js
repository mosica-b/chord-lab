/**
 * Chord Audio Module
 * Web Audio API-based chord sound playback with distinct instrument timbres
 */
const ChordAudio = (() => {
  let audioCtx = null;
  let isPlaying = false;
  let currentInstrument = 'piano';

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

  function setInstrument(instrument) { currentInstrument = instrument; }
  function getInstrument() { return currentInstrument; }

  // =========================================
  // Piano: Hammer strike → rich harmonics → long sustain
  // =========================================
  function playPianoNote(ctx, dest, freq, now, duration) {
    const gain = ctx.createGain();
    gain.connect(dest);
    // Piano envelope: percussive attack, gentle decay, long release
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.06, now + duration * 0.7);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Fundamental
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    o1.connect(g1); g1.connect(gain);

    // 2nd partial (octave)
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.25, now);
    g2.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
    o2.connect(g2); g2.connect(gain);

    // 3rd partial (adds richness)
    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = freq * 3;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.12, now);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
    o3.connect(g3); g3.connect(gain);

    // 4th partial (hammer brightness, decays fast)
    const o4 = ctx.createOscillator();
    o4.type = 'sine';
    o4.frequency.value = freq * 4;
    const g4 = ctx.createGain();
    g4.gain.setValueAtTime(0.08, now);
    g4.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o4.connect(g4); g4.connect(gain);

    [o1, o2, o3, o4].forEach(o => { o.start(now); o.stop(now + duration); });
  }

  // =========================================
  // Guitar: Steel string pluck → filtered harmonics → medium decay
  // =========================================
  function playGuitarNote(ctx, dest, freq, now, duration) {
    const gain = ctx.createGain();
    gain.connect(dest);
    // Guitar: sharp pluck, fast initial decay, warm sustain
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.28, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.10, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.04, now + duration * 0.4);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    // Lowpass filter: guitar body resonance, tone darkens over time
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(5000, now);       // bright at pluck
    lpf.frequency.exponentialRampToValueAtTime(600, now + duration * 0.6); // darkens
    lpf.Q.value = 2;
    lpf.connect(gain);

    // Body resonance peak
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 250; // guitar body ~250Hz
    peak.gain.value = 6;
    peak.Q.value = 3;
    peak.connect(lpf);

    // Sawtooth (rich string harmonics)
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = freq;
    const g1 = ctx.createGain(); g1.gain.value = 0.35;
    o1.connect(g1); g1.connect(peak);

    // Square wave (adds odd harmonics for metallic string character)
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    o2.frequency.value = freq;
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.15, now);
    g2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    o2.connect(g2); g2.connect(peak);

    // Slight detune for chorus/realism
    const o3 = ctx.createOscillator();
    o3.type = 'sawtooth';
    o3.frequency.value = freq * 1.003;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.12, now);
    g3.gain.exponentialRampToValueAtTime(0.02, now + 0.3);
    o3.connect(g3); g3.connect(peak);

    // Pluck noise burst (simulates pick attack)
    const bufferSize = ctx.sampleRate * 0.03;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    const noiseLpf = ctx.createBiquadFilter();
    noiseLpf.type = 'bandpass';
    noiseLpf.frequency.value = freq * 3;
    noiseLpf.Q.value = 1;
    noise.connect(noiseLpf);
    noiseLpf.connect(noiseGain);
    noiseGain.connect(gain);
    noise.start(now);

    [o1, o2, o3].forEach(o => { o.start(now); o.stop(now + duration); });
  }

  // =========================================
  // Ukulele: Nylon pluck → bright & short → happy tone
  // =========================================
  function playUkuleleNote(ctx, dest, freq, now, duration) {
    // Ukulele plays an octave higher for bright, small-body character
    const ukeFreq = freq * 2;
    const ukeDur = Math.min(duration, 1.2); // shorter sustain

    const gain = ctx.createGain();
    gain.connect(dest);
    // Ukulele: snappy pluck, quick decay, very short sustain
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.20, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.02, now + ukeDur * 0.35);
    gain.gain.linearRampToValueAtTime(0.001, now + ukeDur);

    // Bright filter (small nylon body)
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(6000, now);
    lpf.frequency.exponentialRampToValueAtTime(2000, now + ukeDur * 0.3);
    lpf.Q.value = 1;
    lpf.connect(gain);

    // High-mid boost (ukulele brightness)
    const peak = ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = 2000;
    peak.gain.value = 4;
    peak.Q.value = 2;
    peak.connect(lpf);

    // Triangle (soft nylon string)
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = ukeFreq;
    const g1 = ctx.createGain(); g1.gain.value = 0.45;
    o1.connect(g1); g1.connect(peak);

    // Sine fundamental
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = ukeFreq;
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o2.connect(g2); g2.connect(peak);

    // Soft 2nd harmonic
    const o3 = ctx.createOscillator();
    o3.type = 'sine';
    o3.frequency.value = ukeFreq * 2;
    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.12, now);
    g3.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    o3.connect(g3); g3.connect(peak);

    [o1, o2, o3].forEach(o => { o.start(now); o.stop(now + ukeDur); });
  }

  // =========================================
  // Chord playback
  // =========================================
  function playChord(chordName, duration = 1.5, instrument) {
    const inst = instrument || currentInstrument;
    console.log('Playing chord:', chordName, 'instrument:', inst);

    return new Promise((resolve) => {
      const ctx = getAudioContext();
      const notes = MusicTheory.getChordNotes(chordName);
      if (notes.length === 0) { resolve(); return; }

      const now = ctx.currentTime;
      const baseOctave = inst === 'guitar' ? 3 : 4;

      notes.forEach((note, i) => {
        let octave = baseOctave;
        if (i > 0) {
          const prevIdx = MusicTheory.noteIndex(notes[i - 1]);
          const currIdx = MusicTheory.noteIndex(note);
          if (currIdx <= prevIdx) octave++;
        }

        const freq = noteFrequency(note, octave);

        // Strum delay for guitar/ukulele (notes don't hit simultaneously)
        const strumDelay = (inst === 'guitar') ? i * 0.04
                         : (inst === 'ukulele') ? i * 0.025
                         : 0; // piano: simultaneous
        const noteStart = now + strumDelay;

        if (inst === 'guitar') {
          playGuitarNote(ctx, ctx.destination, freq, noteStart, duration);
        } else if (inst === 'ukulele') {
          playUkuleleNote(ctx, ctx.destination, freq, noteStart, duration);
        } else {
          playPianoNote(ctx, ctx.destination, freq, noteStart, duration);
        }
      });

      setTimeout(resolve, duration * 1000);
    });
  }

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

  function stopPlayback() { isPlaying = false; }
  function getIsPlaying() { return isPlaying; }

  return {
    playChord,
    playChordSequence,
    stopPlayback,
    getIsPlaying,
    setInstrument,
    getInstrument,
  };
})();
