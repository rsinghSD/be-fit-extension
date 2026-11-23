/*
 * be-fit background: runs the interval timer and pops the "Get Off The Screen"
 * window when it reaches zero.
 *
 * Chrome/Edge/Safari load this as a service worker; Firefox loads it as an
 * event page with shared.js listed first in the manifest.
 */
if (typeof importScripts === "function" && typeof ext === "undefined") {
  importScripts("shared.js");
}

const LOG_LIMIT = 500;

async function startTimer() {
  const { settings } = await loadState();
  const endsAt = Date.now() + settings.intervalMinutes * 60 * 1000;
  await ext.alarms.clear(ALARM_NAME);
  ext.alarms.create(ALARM_NAME, { when: endsAt });
  await ext.storage.local.set({ endsAt, dueSince: null });
  await setBadge(false);
}

async function markDue() {
  const { dueSince } = await loadState();
  if (!dueSince) {
    await ext.storage.local.set({ endsAt: null, dueSince: Date.now() });
  }
  await setBadge(true);
  await openReminder();
}

async function setBadge(due) {
  try {
    await ext.action.setBadgeBackgroundColor?.({ color: "#2C2C2C" });
    await ext.action.setBadgeText({ text: due ? "!" : "" });
  } catch {
    /* badge is cosmetic */
  }
}

/* Opens (or focuses) a 702x302 window showing the time's-up screen. */
async function openReminder() {
  const url = ext.runtime.getURL("popup.html?view=reminder");

  if (ext.windows?.create) {
    const { reminderWindowId } = await ext.storage.local.get("reminderWindowId");
    if (reminderWindowId != null) {
      try {
        await ext.windows.update(reminderWindowId, { focused: true, drawAttention: true });
        return;
      } catch {
        /* window was closed */
      }
    }
    try {
      const win = await ext.windows.create({
        url,
        type: "popup",
        width: 702,
        height: 302,
        focused: true,
      });
      await ext.storage.local.set({ reminderWindowId: win.id });
      return;
    } catch {
      /* fall through to notification */
    }
  }

  if (ext.notifications?.create) {
    const { settings } = await loadState();
    ext.notifications.create("be-fit-due", {
      type: "basic",
      iconUrl: ext.runtime.getURL("icons/128.png"),
      title: "Get Off The Screen.",
      message: `Do ${settings.pushups} Push-Ups.`,
    });
  }
}

async function complete(result) {
  const state = await loadState();
  const pushups = state.settings.pushups;
  const stats = { ...state.stats };
  if (result === "done") {
    stats.done += 1;
    stats.totalPushups += pushups;
  } else {
    stats.failed += 1;
  }
  const { log = [] } = await ext.storage.local.get("log");
  log.push({ at: Date.now(), result, pushups });
  await ext.storage.local.set({ stats, log: log.slice(-LOG_LIMIT) });
  await startTimer();
}

/* Make sure a timer is always either running or waiting for Fail/Done. */
async function ensureRunning() {
  const { endsAt, dueSince } = await loadState();
  if (dueSince) {
    await setBadge(true);
    return;
  }
  if (!endsAt) {
    await startTimer();
    return;
  }
  if (endsAt <= Date.now()) {
    await markDue();
    return;
  }
  const alarm = await ext.alarms.get(ALARM_NAME);
  if (!alarm) ext.alarms.create(ALARM_NAME, { when: endsAt });
}

ext.runtime.onInstalled.addListener(async () => {
  const stored = await ext.storage.local.get("settings");
  if (!stored.settings) await ext.storage.local.set({ settings: DEFAULT_SETTINGS });
  await ensureRunning();
});

ext.runtime.onStartup?.addListener(ensureRunning);

ext.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) markDue();
});

ext.windows?.onRemoved?.addListener(async (windowId) => {
  const { reminderWindowId } = await ext.storage.local.get("reminderWindowId");
  if (windowId === reminderWindowId) await ext.storage.local.remove("reminderWindowId");
});

ext.notifications?.onClicked?.addListener(async (id) => {
  if (id !== "be-fit-due") return;
  ext.notifications.clear(id);
  try {
    await ext.action.openPopup();
  } catch {
    /* not supported everywhere */
  }
});

ext.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  let work;
  if (msg?.type === "restart") work = startTimer();
  else if (msg?.type === "complete" && (msg.result === "done" || msg.result === "fail")) {
    work = complete(msg.result);
  } else if (msg?.type === "ensure") work = ensureRunning();
  if (!work) return false;
  work.then(
    () => sendResponse({ ok: true }),
    (err) => sendResponse({ ok: false, error: String(err) })
  );
  return true; // keep the channel open for the async response
});
