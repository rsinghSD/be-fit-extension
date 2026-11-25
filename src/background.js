/*
 * be-fit background: runs the interval timer, picks reps (fixed, randomized or
 * Goggins), and alerts the user when time is up – as a popup window, a push
 * notification or both.
 *
 * Chrome/Edge/Safari load this as a service worker; Firefox loads it as an
 * event page with shared.js and sound.js listed first in the manifest.
 */
if (typeof importScripts === "function" && typeof ext === "undefined") {
  importScripts("shared.js");
}

const LOG_LIMIT = 500;
const NOTIFICATION_ID = "be-fit-due";

/* ---------- timer ---------- */

async function startTimer() {
  const state = await loadState();
  const pushups = pickReps(state);
  const endsAt = Date.now() + pickIntervalMs(state.settings);
  const task = {
    pushups,
    prompt: null,
    runningQuote: pick(GOGGINS_RUNNING),
  };
  await ext.alarms.clear(ALARM_NAME);
  await ext.alarms.clear(RETRY_ALARM);
  ext.alarms.create(ALARM_NAME, { when: endsAt });
  await ext.storage.local.set({ endsAt, dueSince: null, failedUntil: null, task });
  await setBadge(false);
}

/* Settings changed but the clock should keep running: re-roll the reps only. */
async function retask() {
  const state = await loadState();
  if (state.dueSince || !state.task) return;
  await ext.storage.local.set({ task: { ...state.task, pushups: pickReps(state) } });
}

async function markDue() {
  const state = await loadState();
  if (!state.dueSince) {
    const pushups = state.task?.pushups ?? pickReps(state);
    const prompt = state.settings.goggins
      ? pick(GOGGINS_OVER).replace("{n}", pushups)
      : pick(PROMPTS);
    await ext.storage.local.set({
      endsAt: null,
      dueSince: Date.now(),
      task: { ...(state.task || {}), pushups, prompt },
    });
  }
  await setBadge(true);
  await alertUser();
}

async function setBadge(due) {
  try {
    await ext.action.setBadgeBackgroundColor?.({ color: "#2C2C2C" });
    await ext.action.setBadgeText({ text: due ? "!" : "" });
  } catch {
    /* badge is cosmetic */
  }
}

/* ---------- alerting ---------- */

async function alertUser() {
  const state = await loadState();
  // Goggins Mode takes over the notification type: you get both.
  let type = state.settings.goggins ? "both" : state.settings.notifyType;
  if (!supportsPush()) type = "popup";

  let windowOpened = false;
  if (type === "popup" || type === "both") windowOpened = await openReminder();
  if (type === "push" || type === "both" || !windowOpened) await pushNotification(state);
  // The reminder window plays the sound itself; otherwise play it from here.
  if (!windowOpened) await playInBackground(state);
}

/* Opens (or focuses) a 702x302 window showing the time's-up screen. */
async function openReminder() {
  if (!ext.windows?.create) return false;
  const url = ext.runtime.getURL("popup.html?view=reminder");
  const { reminderWindowId } = await ext.storage.local.get("reminderWindowId");
  if (reminderWindowId != null) {
    try {
      await ext.windows.update(reminderWindowId, { focused: true, drawAttention: true });
      await ext.runtime.sendMessage({ type: "replay" }).catch(() => {});
      return true;
    } catch {
      /* window was closed */
    }
  }
  try {
    const win = await ext.windows.create({ url, type: "popup", width: 702, height: 302, focused: true });
    await ext.storage.local.set({ reminderWindowId: win.id });
    return true;
  } catch {
    return false;
  }
}

async function pushNotification(state) {
  if (!supportsPush()) return;
  const pushups = state.task?.pushups ?? state.settings.pushups;
  const title = capitalizeWords(state.task?.prompt || "Get off the screen.");
  const options = {
    type: "basic",
    iconUrl: ext.runtime.getURL("icons/128.png"),
    title,
    message: `Do ${pushups} Push-Ups.`,
    priority: 2,
  };
  try {
    await ext.notifications.create(NOTIFICATION_ID, { ...options, requireInteraction: true });
  } catch {
    // Firefox rejects requireInteraction
    await ext.notifications.create(NOTIFICATION_ID, options).catch(() => {});
  }
}

function capitalizeWords(text) {
  return text.replace(/(^|[\s“"(-])(\p{L})/gu, (_, pre, ch) => pre + ch.toUpperCase());
}

/* Chromium: offscreen document. Firefox: this event page can play audio itself. */
async function playInBackground(state) {
  const { customSound } = await ext.storage.local.get("customSound");
  const useCustom = state.settings.customSoundOn && !state.settings.goggins && customSound?.dataUrl;
  const message = {
    type: "play-sound",
    kind: state.settings.goggins ? "siren" : state.settings.sound,
    volume: state.settings.volume,
    customUrl: useCustom ? customSound.dataUrl : null,
  };

  if (typeof playSound === "function" && typeof document !== "undefined") {
    playSound(message.kind, message.volume, message.customUrl).catch(() => {});
    return;
  }
  if (!ext.offscreen?.createDocument) return; // Safari: the push/popup has to do
  try {
    const has = (await ext.offscreen.hasDocument?.()) ?? false;
    if (!has) {
      await ext.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["AUDIO_PLAYBACK"],
        justification: "Play the be-fit alarm when the push-up timer runs out.",
      });
    }
    await ext.runtime.sendMessage({ ...message, target: "offscreen" });
  } catch {
    /* sound is best effort */
  }
}

/* ---------- Fail / Done ---------- */

async function complete(result) {
  const state = await loadState();
  const pushups = state.task?.pushups ?? state.settings.pushups;
  const stats = { ...state.stats };
  if (result === "done") {
    stats.done += 1;
    stats.totalPushups += pushups;
    stats.streak += 1;
    stats.today = { ...stats.today, sets: stats.today.sets + 1 };
  } else {
    stats.failed += 1;
    stats.streak = 0;
  }
  const { log = [] } = await ext.storage.local.get("log");
  log.push({ at: Date.now(), result, pushups });
  await ext.storage.local.set({ stats, log: log.slice(-LOG_LIMIT) });
  ext.notifications?.clear?.(NOTIFICATION_ID);

  // Goggins Mode: failing buys you one minute, then you go again.
  if (result === "fail" && state.settings.goggins) {
    const failedUntil = Date.now() + GOGGINS_FAIL_SECONDS * 1000;
    await ext.storage.local.set({ failedUntil });
    ext.alarms.create(RETRY_ALARM, { when: failedUntil });
    return;
  }
  await startTimer();
}

async function ready() {
  await ext.alarms.clear(RETRY_ALARM);
  await ext.storage.local.set({ failedUntil: null });
}

async function resetStats() {
  await ext.storage.local.set({
    stats: { done: 0, failed: 0, totalPushups: 0, since: Date.now(), streak: 0, today: { date: todayKey(), sets: 0 } },
    log: [],
  });
}

/* Make sure a timer is always either running or waiting for Fail/Done. */
async function ensureRunning() {
  const state = await loadState();
  if (state.dueSince) {
    await setBadge(true);
    if (state.failedUntil && state.failedUntil <= Date.now()) await ready();
    return;
  }
  if (!state.endsAt || !state.task) {
    await startTimer();
    return;
  }
  if (state.endsAt <= Date.now()) {
    await markDue();
    return;
  }
  const alarm = await ext.alarms.get(ALARM_NAME);
  if (!alarm) ext.alarms.create(ALARM_NAME, { when: state.endsAt });
}

/* ---------- events ---------- */

ext.runtime.onInstalled.addListener(async () => {
  const stored = await ext.storage.local.get(["settings", "stats"]);
  if (!stored.settings) await ext.storage.local.set({ settings: DEFAULT_SETTINGS });
  if (!stored.stats) await resetStats();
  await ensureRunning();
});

ext.runtime.onStartup?.addListener(ensureRunning);

ext.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) await markDue();
  if (alarm.name === RETRY_ALARM) {
    await ready();
    await alertUser();
  }
});

ext.windows?.onRemoved?.addListener(async (windowId) => {
  const { reminderWindowId } = await ext.storage.local.get("reminderWindowId");
  if (windowId === reminderWindowId) await ext.storage.local.remove("reminderWindowId");
});

ext.notifications?.onClicked?.addListener(async (id) => {
  if (id !== NOTIFICATION_ID) return;
  ext.notifications.clear(id);
  if (!(await openReminder())) {
    try {
      await ext.action.openPopup();
    } catch {
      /* not supported everywhere */
    }
  }
});

const HANDLERS = {
  restart: startTimer,
  retask,
  ensure: ensureRunning,
  ready,
  "reset-stats": resetStats,
  complete: (msg) => (msg.result === "done" || msg.result === "fail" ? complete(msg.result) : null),
};

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target === "offscreen") return false;
  const handler = HANDLERS[msg?.type];
  const work = handler?.(msg);
  if (!work) return false;
  work.then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: String(err) })
  );
  return true; // keep the channel open for the async response
});
