/*
 * Alarm sounds, generated with Web Audio so no audio files ship with the
 * extension. A user-picked file (customSound.dataUrl) plays instead when set.
 * Used by the popup, the Chromium offscreen page and Firefox's event page.
 */
/* exported playSound, stopSound */

let soundCtx;
let customAudio;
let currentMaster;

const PATTERNS = {
  // three hard square-wave beeps
  alarm: (ctx, out, t) => {
    for (let i = 0; i < 3; i++) tone(ctx, out, "square", 880, t + i * 0.28, 0.18);
    return 0.9;
  },
  // two soft sine beeps
  beep: (ctx, out, t) => {
    for (let i = 0; i < 2; i++) tone(ctx, out, "sine", 1046, t + i * 0.35, 0.22);
    return 0.8;
  },
  // ringing bell: a few decaying partials
  bell: (ctx, out, t) => {
    for (const [f, g] of [[660, 1], [1320, 0.5], [1980, 0.25], [2640, 0.12]]) {
      tone(ctx, out, "sine", f, t, 1.6, g, true);
    }
    return 1.7;
  },
  // Goggins: a merciless rising siren
  siren: (ctx, out, t) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    for (let i = 0; i < 3; i++) {
      osc.frequency.setValueAtTime(520, t + i * 0.6);
      osc.frequency.linearRampToValueAtTime(1250, t + i * 0.6 + 0.55);
    }
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.8, t + 0.03);
    gain.gain.setValueAtTime(0.8, t + 1.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.85);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 1.9);
    return 1.9;
  },
};

function tone(ctx, out, type, freq, t, length, level = 1, decay = false) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(level, t + 0.01);
  if (decay) gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  else {
    gain.gain.setValueAtTime(level, t + length - 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  }
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

/**
 * @param {string} kind     key of PATTERNS
 * @param {number} volume   1–100
 * @param {string} [customUrl] data: URL of a user sound, played instead of `kind`
 * @returns {Promise<void>} resolves when playback has been started
 */
async function playSound(kind, volume, customUrl) {
  stopSound();
  const level = Math.max(0.01, Math.min(1, volume / 100));

  if (customUrl) {
    customAudio = new Audio(customUrl);
    customAudio.volume = level;
    await customAudio.play();
    return;
  }

  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Ctx) return;
  soundCtx ??= new Ctx();
  if (soundCtx.state === "suspended") await soundCtx.resume();
  const master = soundCtx.createGain();
  master.gain.value = level * 0.6;
  master.connect(soundCtx.destination);
  currentMaster = master;
  (PATTERNS[kind] || PATTERNS.alarm)(soundCtx, master, soundCtx.currentTime + 0.05);
}

function stopSound() {
  if (customAudio) {
    customAudio.pause();
    customAudio = null;
  }
  if (currentMaster) {
    currentMaster.disconnect();
    currentMaster = null;
  }
}
