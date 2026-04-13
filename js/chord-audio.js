/**
 * Chord Audio Module
 * Web Audio API-based chord sound playback with distinct instrument timbres
 */
const ChordAudio = (() => {
  let audioCtx = null;
  let isPlaying = false;
  let currentInstrument = 'piano';
  let muteWarningShown = false;

  // WebAudioFont sampled piano (Yamaha CFX)
  let pianoPlayer = null;
  let pianoPreset = null;
  let pianoReady = false;

  const NOTE_SEMITONES = {
    'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5,
    'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
  };

  function noteToMidi(noteName, octave) {
    const normalized = MusicTheory.normalizeNote(noteName);
    return (octave + 1) * 12 + (NOTE_SEMITONES[normalized] || 0);
  }

  function initPianoPreset() {
    if (pianoPlayer || typeof WebAudioFontPlayer === 'undefined') return;
    if (typeof _tone_0000_JCLive_sf2_file === 'undefined') return;

    pianoPlayer = new WebAudioFontPlayer();
    pianoPreset = _tone_0000_JCLive_sf2_file;
    pianoPlayer.adjustPreset(audioCtx, pianoPreset);

    const totalZones = pianoPreset.zones.length;
    function checkDecoded() {
      const decoded = pianoPreset.zones.filter(z => z.buffer).length;
      if (decoded < totalZones) {
        setTimeout(checkDecoded, 50);
      } else {
        pianoReady = true;
        console.log('Piano preset ready:', totalZones, 'zones decoded');
      }
    }
    checkDecoded();
  }

  // Detect mobile device (iOS / Android / touch device)
  function isMobile() {
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
    // iPad desktop mode (iOS 13+): Macintosh UA + touch support
    if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)) return true;
    return false;
  }

  // Show iOS silent mode warning toast (once per session)
  function showMuteWarning() {
    if (muteWarningShown || !isMobile()) return;
    muteWarningShown = true;

    const toast = document.createElement('div');
    toast.id = 'ios-mute-toast';
    toast.innerHTML = '🔇 소리가 안 들리나요?<br><b>무음 모드(매너 모드)를 해제</b>해 주세요';
    Object.assign(toast.style, {
      position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '12px 20px',
      borderRadius: '12px', fontSize: '14px', lineHeight: '1.5',
      textAlign: 'center', zIndex: '99999', maxWidth: '320px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      opacity: '0', transition: 'opacity 0.3s ease',
    });

    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });

    // Auto-dismiss after 4 seconds, or tap to dismiss
    const dismiss = () => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    };
    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, 4000);
  }

  const NOTE_FREQ = {
    'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
    'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
    'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88,
  };

  function createAudioContext() {
    try { if (audioCtx) audioCtx.close(); } catch (e) { /* ignore */ }
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // Reset sampled piano so it re-decodes with the new context
    pianoReady = false;
    pianoPlayer = null;
    initPianoPreset();
  }

  // iOS: resume AudioContext on any user interaction (touch/click)
  // This catches taps after screen unlock before the play button is hit
  let gestureListenerAdded = false;
  function addGestureResumeListener() {
    if (gestureListenerAdded) return;
    gestureListenerAdded = true;

    const resumeOnGesture = () => {
      if (audioCtx) {
        if (audioCtx.state === 'interrupted' || audioCtx.state === 'closed') {
          createAudioContext();
          audioCtx.resume();
        } else if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
    };

    document.addEventListener('touchstart', resumeOnGesture, { passive: true });
    document.addEventListener('touchend', resumeOnGesture, { passive: true });
    document.addEventListener('click', resumeOnGesture, true);

    // Also try resume when page becomes visible again (returning from lock screen)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && audioCtx) {
        if (audioCtx.state === 'interrupted' || audioCtx.state === 'closed') {
          // iOS 'interrupted' state: must recreate
          createAudioContext();
        }
        if (audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }
    });
  }

  // Synchronous getAudioContext — preserves iOS Safari user gesture context
  function getAudioContext() {
    if (!audioCtx) {
      createAudioContext();
      addGestureResumeListener();
    } else if (!pianoPlayer) {
      initPianoPreset();
    }

    // iOS interrupted/closed state: cannot resume, must recreate
    if (audioCtx.state === 'interrupted' || audioCtx.state === 'closed') {
      createAudioContext();
    }

    // Synchronous resume — MUST stay synchronous for iOS user gesture chain
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
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
  // Piano: Sampled Yamaha CFX via WebAudioFont (FM fallback while loading)
  // =========================================
  function playPianoNote(ctx, dest, freq, now, duration, noteName, octave) {
    // Use sampled piano if available
    if (pianoReady && pianoPlayer && pianoPreset && noteName != null) {
      const midi = noteToMidi(noteName, octave);
      pianoPlayer.queueWaveTable(ctx, dest, pianoPreset, now, midi, duration, 0.4);
      return;
    }

    // Fallback: FM synthesis while preset is loading
    const masterGain = ctx.createGain();
    masterGain.connect(dest);
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.18, now + 0.005);
    masterGain.gain.exponentialRampToValueAtTime(0.10, now + 0.08);
    masterGain.gain.exponentialRampToValueAtTime(0.06, now + duration * 0.5);
    masterGain.gain.linearRampToValueAtTime(0.001, now + duration);

    const mod1 = ctx.createOscillator();
    mod1.type = 'sine';
    mod1.frequency.value = freq * 2;
    const mod1Gain = ctx.createGain();
    mod1Gain.gain.setValueAtTime(freq * 1.5, now);
    mod1Gain.gain.exponentialRampToValueAtTime(freq * 0.2, now + 0.15);
    mod1Gain.gain.exponentialRampToValueAtTime(freq * 0.05, now + duration * 0.5);
    mod1.connect(mod1Gain);

    const car1 = ctx.createOscillator();
    car1.type = 'sine';
    car1.frequency.value = freq;
    mod1Gain.connect(car1.frequency);
    const car1Gain = ctx.createGain();
    car1Gain.gain.value = 0.35;
    car1.connect(car1Gain);
    car1Gain.connect(masterGain);

    const res = ctx.createOscillator();
    res.type = 'sine';
    res.frequency.value = freq * 1.001;
    const resGain = ctx.createGain();
    resGain.gain.setValueAtTime(0.08, now);
    resGain.gain.exponentialRampToValueAtTime(0.02, now + 0.5);
    res.connect(resGain);
    resGain.connect(masterGain);

    [mod1, car1, res].forEach(o => { o.start(now); o.stop(now + duration); });
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

    // Show iOS silent mode reminder on first play
    showMuteWarning();

    // Synchronous — preserves iOS user gesture context
    const ctx = getAudioContext();

    return new Promise((resolve) => {
      const notes = MusicTheory.getChordNotes(chordName);
      if (notes.length === 0) { resolve(); return; }

      const now = ctx.currentTime;
      let currentOctave = (inst === 'guitar' || inst === 'piano') ? 3 : 4;

      notes.forEach((note, i) => {
        if (i > 0) {
          const prevIdx = MusicTheory.noteIndex(notes[i - 1]);
          const currIdx = MusicTheory.noteIndex(note);
          if (currIdx <= prevIdx) currentOctave++;
        }

        const freq = noteFrequency(note, currentOctave);

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
          playPianoNote(ctx, ctx.destination, freq, noteStart, duration, note, currentOctave);
        }
      });

      setTimeout(resolve, duration * 1000);
    });
  }

  // =========================================
  // Arpeggio playback (ascending, one note at a time)
  // =========================================
  function playChordArpeggio(chordName, noteDelay = 0.18, duration = 1.2, instrument) {
    const inst = instrument || currentInstrument;
    console.log('Playing arpeggio:', chordName, 'instrument:', inst);

    showMuteWarning();
    const ctx = getAudioContext();

    return new Promise((resolve) => {
      const notes = MusicTheory.getChordNotes(chordName);
      if (notes.length === 0) { resolve(); return; }

      const now = ctx.currentTime;
      let currentOctave = (inst === 'guitar' || inst === 'piano') ? 3 : 4;

      notes.forEach((note, i) => {
        if (i > 0) {
          const prevIdx = MusicTheory.noteIndex(notes[i - 1]);
          const currIdx = MusicTheory.noteIndex(note);
          if (currIdx <= prevIdx) currentOctave++;
        }

        const freq = noteFrequency(note, currentOctave);
        const noteStart = now + i * noteDelay;

        if (inst === 'guitar') {
          playGuitarNote(ctx, ctx.destination, freq, noteStart, duration);
        } else if (inst === 'ukulele') {
          playUkuleleNote(ctx, ctx.destination, freq, noteStart, duration);
        } else {
          playPianoNote(ctx, ctx.destination, freq, noteStart, duration, note, currentOctave);
        }
      });

      const totalDuration = (notes.length - 1) * noteDelay + duration;
      setTimeout(resolve, totalDuration * 1000);
    });
  }

  let playbackGen = 0; // generation counter to cancel stale sequences

  async function playChordSequence(chordNames, interval = 1.8, onChordStart, instrument) {
    // Stop any existing playback first
    isPlaying = false;
    playbackGen++;
    const myGen = playbackGen;

    // Brief yield to let previous sequence's awaits settle
    await new Promise(r => setTimeout(r, 30));
    if (myGen !== playbackGen) return; // another call superseded us

    isPlaying = true;

    for (let i = 0; i < chordNames.length; i++) {
      if (!isPlaying || myGen !== playbackGen) break;
      if (onChordStart) onChordStart(chordNames[i], i);
      await playChord(chordNames[i], interval - 0.2, instrument);
      if (myGen !== playbackGen) break;
      await new Promise(r => setTimeout(r, 200));
    }

    // Only reset if we're still the active sequence
    if (myGen === playbackGen) isPlaying = false;
  }

  function stopPlayback() {
    isPlaying = false;
    playbackGen++;
    if (pianoPlayer && audioCtx) {
      pianoPlayer.cancelQueue(audioCtx);
    }
  }
  function getIsPlaying() { return isPlaying; }

  // Eagerly create AudioContext on first user interaction to preload piano samples
  // This ensures preset is decoded BEFORE the user clicks a play button
  function preloadPiano() {
    if (!audioCtx) {
      createAudioContext();
      addGestureResumeListener();
    } else if (!pianoPlayer) {
      initPianoPreset();
    }
    document.removeEventListener('pointerdown', preloadPiano, true);
    document.removeEventListener('touchstart', preloadPiano);
  }
  document.addEventListener('pointerdown', preloadPiano, { capture: true });
  document.addEventListener('touchstart', preloadPiano, { passive: true });

  // On desktop, also try to preload immediately on DOMContentLoaded
  if (!isMobile()) {
    const eager = () => {
      if (!audioCtx) {
        try {
          createAudioContext();
          addGestureResumeListener();
        } catch (e) { /* some browsers block without gesture */ }
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', eager);
    } else {
      eager();
    }
  }

  return {
    playChord,
    playChordArpeggio,
    playChordSequence,
    stopPlayback,
    getIsPlaying,
    setInstrument,
    getInstrument,
    showMuteWarning,
  };
})();
