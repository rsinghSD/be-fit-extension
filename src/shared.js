/*
 * Shared between the background script and the popup.
 * Works in Chrome, Edge, Firefox and Safari: every browser exposes either
 * the promise-based `browser` namespace or `chrome` (promise-based in MV3).
 */
/* exported ext, ALARM_NAME, SETTINGS, DEFAULT_SETTINGS, clampSetting, loadState */

const ext = globalThis.browser ?? globalThis.chrome;

const ALARM_NAME = "be-fit-interval";

/* Slider ranges straight from the Figma "Configure Window" panel. */
const SETTINGS = {
  intervalMinutes: { min: 5, max: 60, fallback: 15 },
  pushups: { min: 1, max: 50, fallback: 10 },
  volume: { min: 1, max: 100, fallback: 50 },
};

const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(SETTINGS).map(([key, { fallback }]) => [key, fallback])
);

function clampSetting(key, value) {
  const { min, max, fallback } = SETTINGS[key];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Storage layout (storage.local):
 *   settings  { intervalMinutes, pushups, volume }
 *   endsAt    epoch ms when the running countdown hits 0, or null
 *   dueSince  epoch ms when the countdown hit 0 and is waiting for Fail/Done, or null
 *   stats     { done, failed, totalPushups }
 *   log       [{ at, result: "done" | "fail", pushups }]  (last 500 entries)
 */
async function loadState() {
  const stored = await ext.storage.local.get(["settings", "endsAt", "dueSince", "stats"]);
  const settings = { ...DEFAULT_SETTINGS, ...(stored.settings || {}) };
  for (const key of Object.keys(SETTINGS)) settings[key] = clampSetting(key, settings[key]);
  return {
    settings,
    endsAt: stored.endsAt ?? null,
    dueSince: stored.dueSince ?? null,
    stats: { done: 0, failed: 0, totalPushups: 0, ...(stored.stats || {}) },
  };
}
