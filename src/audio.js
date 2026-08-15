/**
 * Math Defense: Kingdom Siege - Sound Effects Engine
 * Synthesizes professional-grade audio effects using the Web Audio API.
 * No external assets required!
 *
 * Features:
 * - Pre-cached noise AudioBuffers for zero-allocation playback
 * - ADSR envelopes with exponentialRampToValueAtTime for natural decay
 * - Harmonic layering for richer timbres
 * - Look-ahead scheduler for sample-accurate BGM timing
 */

const SoundEngine = {
  ctx: null,
  enabled: true,
  bgmInterval: null,
  noiseBufferShort: null,   // 0.1s white noise (hits, snare drums)
  noiseBufferLong: null,    // 0.8s white noise (fireballs, explosions)
  _urgentLastTime: 0,       // cooldown tracker for playUrgent

  init() {
    if (this.ctx) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContextClass();
      this._generateNoiseBuffers();
    } catch (e) {
      console.warn("Web Audio API is not supported in this browser.", e);
    }
  },

  /**
   * Pre-generate reusable noise buffers so we never allocate during playback.
   */
  _generateNoiseBuffers() {
    if (!this.ctx) return;

    // Short noise buffer — 0.1 seconds (hits, snare)
    const shortLen = Math.ceil(this.ctx.sampleRate * 0.1);
    this.noiseBufferShort = this.ctx.createBuffer(1, shortLen, this.ctx.sampleRate);
    const shortData = this.noiseBufferShort.getChannelData(0);
    for (let i = 0; i < shortLen; i++) {
      shortData[i] = Math.random() * 2 - 1;
    }

    // Long noise buffer — 0.8 seconds (fireballs, large explosions)
    const longLen = Math.ceil(this.ctx.sampleRate * 0.8);
    this.noiseBufferLong = this.ctx.createBuffer(1, longLen, this.ctx.sampleRate);
    const longData = this.noiseBufferLong.getChannelData(0);
    for (let i = 0; i < longLen; i++) {
      longData[i] = Math.random() * 2 - 1;
    }
  },

  resume() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  /**
   * Lazily create and resume the audio context from a user interaction.
   * Browser autoplay policies require this before sounds can be scheduled.
   */
  ensureReady() {
    if (!this.enabled) return false;
    this.resume();
    return Boolean(this.ctx);
  },

  toggleSound(forceState) {
    this.enabled = (forceState !== undefined) ? forceState : !this.enabled;
    if (!this.enabled) {
      this.stopBGM();
    } else {
      this.resume();
    }
    return this.enabled;
  },

  /**
   * Helper to create an oscillator + gain with exponential decay.
   */
  createOsc(type, freq, duration, gainStart) {
    if (!this.ensureReady()) return null;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gainNode.gain.setValueAtTime(gainStart, this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    return { osc, gainNode };
  },

  // ─────────────────────────────────────────────────────────────
  //  SOUND EFFECTS
  // ─────────────────────────────────────────────────────────────

  /**
   * Shoot — triangle sweep 150→800Hz plus a 2nd harmonic (sine at 2×freq)
   * for extra body.
   */
  playShoot() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const dur = 0.15;

    // Main oscillator — triangle sweep
    const main = this.createOsc('triangle', 150, dur, 0.3);
    if (!main) return;
    main.osc.frequency.exponentialRampToValueAtTime(800, t + dur);
    main.osc.start(t);
    main.osc.stop(t + dur + 0.01);

    // 2nd harmonic — sine at 2× frequency, 50% volume
    const harm = this.ctx.createOscillator();
    const harmGain = this.ctx.createGain();
    harm.type = 'sine';
    harm.frequency.setValueAtTime(300, t);
    harm.frequency.exponentialRampToValueAtTime(1600, t + dur);
    harmGain.gain.setValueAtTime(0.15, t);
    harmGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    harm.connect(harmGain);
    harmGain.connect(this.ctx.destination);
    harm.start(t);
    harm.stop(t + dur + 0.01);
  },

  /**
   * Hit — cached noise burst through lowpass filter + bass thump.
   */
  playHit() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;

    // Noise layer from cached short buffer
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBufferShort;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 0.1);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.4, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 0.1);

    // Low bass thump
    const sub = this.createOsc('sine', 100, 0.15, 0.5);
    if (sub) {
      sub.osc.frequency.linearRampToValueAtTime(40, t + 0.15);
      sub.osc.start(t);
      sub.osc.stop(t + 0.16);
    }
  },

  /**
   * Damage — descending sawtooth growl.
   */
  playDamage() {
    if (!this.ensureReady()) return;

    const sound = this.createOsc('sawtooth', 300, 0.4, 0.4);
    if (!sound) return;

    const t = this.ctx.currentTime;
    sound.osc.frequency.linearRampToValueAtTime(60, t + 0.4);
    sound.osc.start(t);
    sound.osc.stop(t + 0.41);
  },

  /**
   * Freeze — metallic chime cluster (3 detuned sines).
   */
  playFreeze() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const freqs = [1200, 1500, 1850];
    freqs.forEach((f, idx) => {
      const gainNode = this.ctx.createGain();
      const osc = this.ctx.createOscillator();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      gainNode.gain.setValueAtTime(0.15, t);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + 1.2 - idx * 0.2);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(t);
      osc.stop(t + 1.3);
    });
  },

  /**
   * Fireball — cached long noise explosion + sub-bass rumble (60→20Hz).
   */
  playFireball() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;

    // --- Noise explosion layer (cached long buffer) ---
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBufferLong;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(50, t + 0.7);

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.6, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + 0.8);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 0.8);

    // --- Sub-bass rumble layer (sine 60→20Hz) ---
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(60, t);
    subOsc.frequency.exponentialRampToValueAtTime(20, t + 0.6);
    subGain.gain.setValueAtTime(0.15, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(t);
    subOsc.stop(t + 0.61);
  },

  /**
   * Level Up — ascending C Major arpeggio.
   */
  playLevelUp() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, index) => {
      const noteDelay = index * 0.08;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + noteDelay);

      gainNode.gain.setValueAtTime(0.0, t + noteDelay);
      gainNode.gain.linearRampToValueAtTime(0.2, t + noteDelay + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + noteDelay + 0.3);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(t + noteDelay);
      osc.stop(t + noteDelay + 0.35);
    });
  },

  /**
   * Victory — triumphant C Major chord fanfare.
   */
  playVictory() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const notes = [
      [261.63, 0.0],   // C4
      [329.63, 0.0],   // E4
      [392.00, 0.0],   // G4
      [523.25, 0.15],  // C5
      [659.25, 0.15],  // E5
      [783.99, 0.15],  // G5
      [1046.50, 0.3]   // C6
    ];

    notes.forEach(([freq, delay]) => {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + delay);

      gainNode.gain.setValueAtTime(0.0, t + delay);
      gainNode.gain.linearRampToValueAtTime(0.15, t + delay + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.8);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(t + delay);
      osc.stop(t + delay + 0.9);
    });
  },

  /**
   * Defeat — descending C minor chord.
   */
  playDefeat() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const notes = [
      [523.25, 0.0],   // C5
      [466.16, 0.15],  // Bb4
      [392.00, 0.3],   // G4
      [311.13, 0.45],  // Eb4
      [261.63, 0.6],   // C4
      [196.00, 0.8]    // G3
    ];

    notes.forEach(([freq, delay]) => {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + delay);

      gainNode.gain.setValueAtTime(0.0, t + delay);
      gainNode.gain.linearRampToValueAtTime(0.2, t + delay + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.6);

      osc.connect(gainNode);
      gainNode.connect(this.ctx.destination);

      osc.start(t + delay);
      osc.stop(t + delay + 0.7);
    });
  },

  /**
   * Click — short sine pip.
   */
  playClick() {
    if (!this.ensureReady()) return;

    const sound = this.createOsc('sine', 600, 0.05, 0.15);
    if (sound) {
      sound.osc.start();
      sound.osc.stop(this.ctx.currentTime + 0.06);
    }
  },

  // ─────────────────────────────────────────────────────────────
  //  NEW SOUND EFFECTS
  // ─────────────────────────────────────────────────────────────

  /**
   * Shield — ascending sine sweep with delayed echo and high shimmer.
   *
   * Layers:
   *   1. Main sweep 200→1200Hz over 0.6s
   *   2. Two echo repetitions (~150ms delay, decaying gain)
   *   3. Shimmer: quiet 2400Hz sine with 8Hz tremolo LFO
   */
  playShield() {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const sweepDur = 0.6;
    const totalDur = 0.8;

    // --- Layer 1: ascending sine sweep ---
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sine';
    sweepOsc.frequency.setValueAtTime(200, t);
    sweepOsc.frequency.exponentialRampToValueAtTime(1200, t + sweepDur);
    sweepGain.gain.setValueAtTime(0.12, t);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + totalDur);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.ctx.destination);
    sweepOsc.start(t);
    sweepOsc.stop(t + totalDur + 0.01);

    // --- Layer 2: echo repetitions (feedback delay) ---
    // Echo 1: +150ms, gain 0.06
    const echo1Osc = this.ctx.createOscillator();
    const echo1Gain = this.ctx.createGain();
    echo1Osc.type = 'sine';
    echo1Osc.frequency.setValueAtTime(200, t + 0.15);
    echo1Osc.frequency.exponentialRampToValueAtTime(1200, t + 0.15 + sweepDur);
    echo1Gain.gain.setValueAtTime(0.001, t);
    echo1Gain.gain.setValueAtTime(0.06, t + 0.15);
    echo1Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + sweepDur + 0.1);
    echo1Osc.connect(echo1Gain);
    echo1Gain.connect(this.ctx.destination);
    echo1Osc.start(t + 0.15);
    echo1Osc.stop(t + totalDur + 0.16);

    // Echo 2: +300ms, gain 0.03
    const echo2Osc = this.ctx.createOscillator();
    const echo2Gain = this.ctx.createGain();
    echo2Osc.type = 'sine';
    echo2Osc.frequency.setValueAtTime(200, t + 0.30);
    echo2Osc.frequency.exponentialRampToValueAtTime(1200, t + 0.30 + sweepDur);
    echo2Gain.gain.setValueAtTime(0.001, t);
    echo2Gain.gain.setValueAtTime(0.03, t + 0.30);
    echo2Gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30 + sweepDur + 0.1);
    echo2Osc.connect(echo2Gain);
    echo2Gain.connect(this.ctx.destination);
    echo2Osc.start(t + 0.30);
    echo2Osc.stop(t + totalDur + 0.31);

    // --- Layer 3: shimmer — 2400Hz sine with 8Hz tremolo ---
    const shimmerOsc = this.ctx.createOscillator();
    const shimmerGain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    shimmerOsc.type = 'sine';
    shimmerOsc.frequency.setValueAtTime(2400, t);

    // LFO modulates shimmerGain amplitude
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(8, t);
    lfoGain.gain.setValueAtTime(0.03, t); // tremolo depth

    // Base level for shimmer
    shimmerGain.gain.setValueAtTime(0.04, t);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, t + totalDur);

    lfo.connect(lfoGain);
    lfoGain.connect(shimmerGain.gain);
    shimmerOsc.connect(shimmerGain);
    shimmerGain.connect(this.ctx.destination);

    lfo.start(t);
    shimmerOsc.start(t);
    lfo.stop(t + totalDur + 0.01);
    shimmerOsc.stop(t + totalDur + 0.01);
  },

  /**
   * Combo chime — quick rising tone that scales with combo count.
   *
   * @param {number} comboCount - current combo multiplier (1+)
   */
  playCombo(comboCount) {
    if (!this.ensureReady()) return;

    const t = this.ctx.currentTime;
    const baseFreq = Math.min(600 + ((comboCount || 1) * 80), 1600);
    const dur = 0.15;

    // Main chime
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, t);
    gainNode.gain.setValueAtTime(0.12, t);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);

    // Octave harmonic (quiet)
    const harmOsc = this.ctx.createOscillator();
    const harmGain = this.ctx.createGain();
    harmOsc.type = 'sine';
    harmOsc.frequency.setValueAtTime(baseFreq * 2, t);
    harmGain.gain.setValueAtTime(0.05, t);
    harmGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    harmOsc.connect(harmGain);
    harmGain.connect(this.ctx.destination);
    harmOsc.start(t);
    harmOsc.stop(t + dur + 0.01);
  },

  /**
   * Urgent — two quick sine pulses at 440Hz.
   * Internal cooldown: will not fire more than once per 3 seconds.
   */
  playUrgent() {
    if (!this.ensureReady()) return;

    // Cooldown check (3 seconds)
    const now = performance.now();
    if (now - this._urgentLastTime < 3000) return;
    this._urgentLastTime = now;

    const t = this.ctx.currentTime;
    const pulseFreq = 440;
    const pulseDur = 0.08;
    const gap = 0.12;
    const gain = 0.08;

    // Pulse 1
    const osc1 = this.ctx.createOscillator();
    const g1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(pulseFreq, t);
    g1.gain.setValueAtTime(gain, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + pulseDur);
    osc1.connect(g1);
    g1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + pulseDur + 0.01);

    // Pulse 2
    const pulse2Start = t + gap;
    const osc2 = this.ctx.createOscillator();
    const g2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(pulseFreq, pulse2Start);
    g2.gain.setValueAtTime(0.001, t);
    g2.gain.setValueAtTime(gain, pulse2Start);
    g2.gain.exponentialRampToValueAtTime(0.001, pulse2Start + pulseDur);
    osc2.connect(g2);
    g2.connect(this.ctx.destination);
    osc2.start(pulse2Start);
    osc2.stop(pulse2Start + pulseDur + 0.01);
  },

  // ─────────────────────────────────────────────────────────────
  //  BACKGROUND MUSIC — look-ahead scheduler
  // ─────────────────────────────────────────────────────────────

  /**
   * Starts the BGM using a precise look-ahead scheduler pattern.
   *
   * Instead of firing note synthesis from a jittery setInterval callback,
   * we keep a "nextBeatTime" cursor on the AudioContext timeline and
   * pre-schedule all notes that fall within the next 0.1 s look-ahead
   * window. The setInterval just pumps the scheduler at ~25 ms.
   *
   * Musical structure is preserved exactly:
   *   Beats  0–63   : intro  (triangle, no drums/bass)
   *   Beats  64–191 : verse  (triangle + drums + bass)
   *   Beats 192–255 : chorus (square + drums + bass)
   *   Beats 256–319 : verse  (triangle + drums + bass)
   *   Beats 320–383 : chorus (square + drums + bass)
   *   Beats 384–447 : coda   (sawtooth + drums + bass)
   *   Beats 448–511 : coda   (sine, sparse drums, no bass)
   *   Then loops back to beat 0.
   *
   * @param {number} levelNum - (reserved for future per-level variation)
   */
  startBGM(levelNum) {
    if (!this.ensureReady()) return;

    // Stop existing loop before starting new one
    this.stopBGM();

    // ── Constants ──
    const BEAT_DURATION = 0.250;  // 250ms per beat → 120 BPM 8th notes
    const LOOK_AHEAD   = 0.1;    // schedule 100ms into the future
    const SCHEDULER_MS  = 25;    // pump every 25ms
    const TOTAL_BEATS   = 512;

    // ── Chord definitions ── (A minor adventure theme)
    const chords = {
      Am: [220.00, 261.63, 329.63, 440.00],
      F:  [174.61, 220.00, 261.63, 349.23],
      C:  [261.63, 329.63, 392.00, 523.25],
      G:  [196.00, 246.94, 293.66, 392.00],
      Dm: [293.66, 349.23, 440.00, 587.33],
      E:  [329.63, 415.30, 493.88, 659.25]
    };

    const getChord = (b, section) => {
      const measure = Math.floor((b % 64) / 16);
      if (section === 'intro') {
        return [chords.Am, chords.F, chords.Am, chords.G][measure];
      } else if (section === 'verse') {
        return [chords.Am, chords.C, chords.G, chords.Dm][measure];
      } else if (section === 'chorus') {
        return [chords.F, chords.C, chords.Am, chords.G][measure];
      } else if (section === 'coda') {
        return [chords.F, chords.G, chords.Am, chords.E][measure];
      }
      return chords.Am;
    };

    // ── Mutable state captured in closure ──
    let beat = 0;
    let nextBeatTime = this.ctx.currentTime;

    /**
     * Schedule a single beat at exact AudioContext time `at`.
     */
    const scheduleBeat = (at, b) => {
      if (!this.enabled) return;

      // ── Determine section properties ──
      let section   = 'intro';
      let type      = 'sine';
      let gainMax   = 0.03;
      let playDrums = false;
      let playBass  = false;

      if (b < 64) {
        section = 'intro';
        type = 'triangle';
      } else if (b < 192) {
        section = 'verse';
        type = 'triangle';
        playDrums = true;
        playBass = true;
      } else if (b < 256) {
        section = 'chorus';
        type = 'square';
        gainMax = 0.02;
        playDrums = true;
        playBass = true;
      } else if (b < 320) {
        section = 'verse';
        type = 'triangle';
        playDrums = true;
        playBass = true;
      } else if (b < 384) {
        section = 'chorus';
        type = 'square';
        gainMax = 0.02;
        playDrums = true;
        playBass = true;
      } else if (b < 448) {
        section = 'coda';
        type = 'sawtooth';
        gainMax = 0.02;
        playDrums = true;
        playBass = true;
      } else {
        section = 'coda';
        type = 'sine';
        playDrums = (b % 8 === 0); // sparse drums in final coda
      }

      const chord = getChord(b, section);
      const note  = chord[b % 4];

      // ── Arpeggio note ──
      const osc = this.ctx.createOscillator();
      const gn  = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(note, at);
      gn.gain.setValueAtTime(0.001, at);
      gn.gain.linearRampToValueAtTime(gainMax, at + 0.05);
      gn.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
      osc.connect(gn);
      gn.connect(this.ctx.destination);
      osc.start(at);
      osc.stop(at + 0.25);

      // ── Bassline (root / 2, every 4 beats) ──
      if (playBass && b % 4 === 0) {
        const bassOsc  = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = 'sawtooth';
        bassOsc.frequency.setValueAtTime(chord[0] / 2, at);
        bassGain.gain.setValueAtTime(0.001, at);
        bassGain.gain.linearRampToValueAtTime(0.02, at + 0.05);
        bassGain.gain.exponentialRampToValueAtTime(0.001, at + 0.5);
        bassOsc.connect(bassGain);
        bassGain.connect(this.ctx.destination);
        bassOsc.start(at);
        bassOsc.stop(at + 0.6);
      }

      // ── Drums ──
      if (playDrums) {
        // Kick on beats 0, 4 (within every group of 8)
        if (b % 8 === 0 || b % 8 === 4) {
          const kickOsc  = this.ctx.createOscillator();
          const kickGain = this.ctx.createGain();
          kickOsc.type = 'sine';
          kickOsc.frequency.setValueAtTime(80, at);
          kickOsc.frequency.exponentialRampToValueAtTime(30, at + 0.15);
          kickGain.gain.setValueAtTime(0.001, at);
          kickGain.gain.linearRampToValueAtTime(0.08, at + 0.02);
          kickGain.gain.exponentialRampToValueAtTime(0.001, at + 0.2);
          kickOsc.connect(kickGain);
          kickGain.connect(this.ctx.destination);
          kickOsc.start(at);
          kickOsc.stop(at + 0.22);
        }

        // Snare on beats 2, 6 — uses cached short noise buffer
        if (b % 8 === 2 || b % 8 === 6) {
          const snSource = this.ctx.createBufferSource();
          snSource.buffer = this.noiseBufferShort;

          const snFilter = this.ctx.createBiquadFilter();
          snFilter.type = 'bandpass';
          snFilter.frequency.setValueAtTime(1200, at);

          const snGain = this.ctx.createGain();
          snGain.gain.setValueAtTime(0.015, at);
          snGain.gain.exponentialRampToValueAtTime(0.001, at + 0.08);

          snSource.connect(snFilter);
          snFilter.connect(snGain);
          snGain.connect(this.ctx.destination);

          snSource.start(at);
          snSource.stop(at + 0.09);
        }
      }
    };

    /**
     * Look-ahead scheduler: fires every SCHEDULER_MS, schedules any beats
     * whose time falls within [now, now + LOOK_AHEAD].
     */
    const scheduleAhead = () => {
      if (!this.ctx || !this.enabled) return;

      const deadline = this.ctx.currentTime + LOOK_AHEAD;

      while (nextBeatTime < deadline) {
        scheduleBeat(nextBeatTime, beat);
        beat++;
        if (beat >= TOTAL_BEATS) {
          beat = 0; // loop
        }
        nextBeatTime += BEAT_DURATION;
      }
    };

    // Start the scheduler pump
    this.bgmInterval = setInterval(scheduleAhead, SCHEDULER_MS);
  },

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }
};

// Export to work in both ES6 modules and global browser scope
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SoundEngine;
} else {
  window.SoundEngine = SoundEngine;
}
