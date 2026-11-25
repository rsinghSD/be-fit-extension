/*
 * Shared between the background script, the popup and the offscreen page.
 * Works in Chrome, Edge, Firefox and Safari: every browser exposes either
 * the promise-based `browser` namespace or `chrome` (promise-based in MV3).
 */
/* exported ext, ALARM_NAME, RETRY_ALARM, SETTINGS, DEFAULT_SETTINGS, DEFAULT_RRA,
   RECOVERY_LEVELS, SOUNDS, NOTIFY_TYPES, PROMPTS, GOGGINS_OVER, GOGGINS_RUNNING,
   GOGGINS_FAIL_SECONDS, clampSetting, loadState, pickReps, pickIntervalMs, pick,
   todayKey, supportsPush, REPO_URL */

const ext = globalThis.browser ?? globalThis.chrome;

const REPO_URL = "https://github.com/rsinghSD/be-fit-extension";

const ALARM_NAME = "be-fit-interval";
const RETRY_ALARM = "be-fit-retry";
const GOGGINS_FAIL_SECONDS = 60;

/* Slider ranges from the Figma "Change Interval/Reps" page. */
const SETTINGS = {
  intervalMinutes: { min: 5, max: 60, fallback: 15 },
  pushups: { min: 1, max: 100, fallback: 10 },
  volume: { min: 1, max: 100, fallback: 50 },
};

const NOTIFY_TYPES = {
  popup: "Popup",
  push: "Push",
  both: "Push + Popup",
};

/* Built-in alarm sounds (generated with Web Audio, see sound.js). */
const SOUNDS = {
  alarm: "Alarm",
  beep: "Beep",
  bell: "Bell",
  siren: "Siren",
};

const DEFAULT_SETTINGS = {
  intervalMinutes: SETTINGS.intervalMinutes.fallback,
  pushups: SETTINGS.pushups.fallback,
  volume: SETTINGS.volume.fallback,
  randomReps: false,
  notifyType: "popup",
  sound: "alarm",
  customSoundOn: false,
  goggins: false,
};

/* Randomized Reps Configuration (onboarding 1/3 – 3/3). */
const RECOVERY_LEVELS = [
  { label: "Very quick", range: [0.6, 0.9] },
  { label: "Quick", range: [0.5, 0.8] },
  { label: "Average", range: [0.4, 0.7] },
  { label: "Slow", range: [0.3, 0.6] },
];

const DEFAULT_RRA = { maxPushups: 50, comfortable: 20, recovery: 1, done: false };

/* "Push-Up Prompts" frames: the line above "Do N push-ups." rotates. */
const PROMPTS = [
  "get off the screen.",
  "prove yourself strength.",
  "it’s time to take a break.",
  "get your focus back.",
  "it’s time to stop being soft. hit the floor.",
  "“your excuses don’t build muscle. push-ups do.”",
  "level up your body.",
  "prove it.",
  "one push-up at a time.",
  "the floor’s been waiting.",
  "gravity is mocking you. prove it wrong.",
  "those push-ups won’t do themselves.",
  "show your chair who’s the boss.",
];

/* Goggins Mode quotes. {n} is replaced by the rep count. */
const GOGGINS_OVER = [
  "“Stop being soft. Drop {n}.”",
  "“Weaklings scroll. You push.”",
  "“Discipline > excuses. Prove it.”",
  "“Most people quit. Be the exception.”",
  "“Comfort makes cowards.”",
  "“No one’s coming to save you. push.”",
  "“Earn your oxygen.”",
  "“Your future self is watching. Disappointed.”",
  "“Quit crying, start sweating.”",
  "“Pain is the price of progress.”",
  "“Excuses don’t do push-ups.”",
  "“Lazy minds make weak bodies.”",
  "“The floor is waiting. Move.”",
  "“Be stronger than your mood.”",
  "“Fear the regret, not the reps.”",
];

const GOGGINS_RUNNING = [
  "“Tick… tick… your excuses are dying.”",
  "“Each second = one more rep you owe.”",
  "“The clock’s moving. Are you?”",
  "“Every second you wait, you get softer.”",
  "“You’re not tired. You’re just lazy.”",
  "“Discipline is built here. In the silence.”",
  "“The old you hopes you quit.”",
  "“Comfort’s whispering. Break its jaw.”",
  "“You said you wanted change. Prove it.”",
  "“Pain’s coming. Smile at it.”",
  "“Every second of doubt is weakness growing.”",
  "“Countdown to war. Get ready.”",
  "“Future you is watching this timer too.”",
];

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function clampSetting(key, value) {
  const { min, max, fallback } = SETTINGS[key];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

/* Safari has no notifications API, so "Push" is only offered elsewhere. */
function supportsPush() {
  return Boolean(ext.notifications?.create);
}

/**
 * Storage layout (storage.local):
 *   settings     see DEFAULT_SETTINGS
 *   rra          Randomized Reps Configuration answers, see DEFAULT_RRA
 *   customSound  { name, dataUrl } – a user-picked audio file
 *   endsAt       epoch ms when the running countdown hits 0, or null
 *   dueSince     epoch ms when it hit 0 and is waiting for Fail/Done, or null
 *   failedUntil  Goggins Mode: end of the 60 s "gather yourself" break, or null
 *   task         { pushups, prompt, runningQuote } for the current interval
 *   stats        { done, failed, totalPushups, since, streak, today: { date, sets } }
 *   log          [{ at, result: "done" | "fail", pushups }]  (last 500 entries)
 */
async function loadState() {
  const stored = await ext.storage.local.get([
    "settings", "rra", "endsAt", "dueSince", "failedUntil", "task", "stats",
  ]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  for (const key of Object.keys(SETTINGS)) settings[key] = clampSetting(key, settings[key]);
  if (!NOTIFY_TYPES[settings.notifyType]) settings.notifyType = DEFAULT_SETTINGS.notifyType;
  if (!SOUNDS[settings.sound]) settings.sound = DEFAULT_SETTINGS.sound;

  const stats = {
    done: 0, failed: 0, totalPushups: 0, since: Date.now(), streak: 0,
    today: { date: todayKey(), sets: 0 },
    ...(stored.stats || {}),
  };
  if (stats.today?.date !== todayKey()) stats.today = { date: todayKey(), sets: 0 };

  return {
    settings,
    rra: { ...DEFAULT_RRA, ...(stored.rra || {}) },
    endsAt: stored.endsAt ?? null,
    dueSince: stored.dueSince ?? null,
    failedUntil: stored.failedUntil ?? null,
    task: stored.task ?? null,
    stats,
  };
}

/**
 * Reps for the next interval.
 * Randomizer + fatigue system straight from the "Randomizer Onboarding" frame:
 *   minReps = max(comfortable, round(maxPushups * minPercent))
 *   maxReps = round(maxPushups * maxPercent)
 *   reps    = random integer in [minReps, maxReps]
 *   fatigueFactor = max(0.7, 1 - setsDoneToday * 0.05)
 * Goggins Mode pushes the algorithm to the max and ignores fatigue.
 */
function pickReps(state) {
  const { settings, rra, stats } = state;
  const randomized = settings.goggins || (settings.randomReps && rra.done);
  if (!randomized) return settings.pushups;

  const [minPercent, maxPercent] = settings.goggins
    ? [0.7, 1]
    : (RECOVERY_LEVELS[rra.recovery] || RECOVERY_LEVELS[1]).range;
  const minReps = Math.max(rra.comfortable, Math.round(rra.maxPushups * minPercent));
  const maxReps = Math.max(minReps, Math.round(rra.maxPushups * maxPercent));
  const reps = Math.floor(Math.random() * (maxReps - minReps + 1)) + minReps;

  const fatigueFactor = settings.goggins ? 1 : Math.max(0.7, 1 - stats.today.sets * 0.05);
  return clampSetting("pushups", Math.round(reps * fatigueFactor));
}

/* Goggins Mode: "Randomized Intervals without mercy" – 2 to 20 minutes. */
function pickIntervalMs(settings) {
  if (!settings.goggins) return settings.intervalMinutes * 60 * 1000;
  const seconds = 120 + Math.floor(Math.random() * (18 * 60 + 1));
  return seconds * 1000;
}
