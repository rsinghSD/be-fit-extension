/*
 * be-fit popup screens. The same page is used as:
 *   - the toolbar popup               popup.html
 *   - the time's-up window            popup.html?view=reminder
 *   - a tab (e.g. to pick a sound)    popup.html?tab=1&page=sound
 * menu.js adds the be-fit menu on top of this.
 */
/* global ext, loadState, playSound, stopSound, soundCtx, DEFAULT_SETTINGS, DEFAULT_RRA */

const params = new URLSearchParams(location.search);
const isReminder = params.get("view") === "reminder";
const isTab = params.has("tab");

const $ = (id) => document.getElementById(id);
const screenEl = $("screen");

const befit = {
  state: { settings: { ...DEFAULT_SETTINGS }, rra: { ...DEFAULT_RRA }, stats: {}, task: null },
  isReminder,
  isTab,
  listeners: [],
  onChange(fn) {
    this.listeners.push(fn);
  },
  send(message) {
    return ext.runtime.sendMessage(message);
  },
};
globalThis.befit = befit;

if (isTab) document.body.classList.add("in-tab");

/* ---------- rendering ---------- */

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function setText(el, text) {
  if (el.textContent !== String(text)) el.textContent = text;
}

function currentView() {
  const { dueSince, failedUntil } = befit.state;
  if (dueSince && failedUntil && failedUntil > Date.now()) return "failed";
  if (dueSince) return "due";
  return "timer";
}

function renderClock() {
  const { endsAt, settings, failedUntil } = befit.state;
  const remaining = endsAt ? endsAt - Date.now() : settings.intervalMinutes * 60 * 1000;
  setText($("countdown"), formatClock(remaining));
  if (failedUntil) setText($("failedTime"), formatClock(failedUntil - Date.now()));
  const view = currentView();
  if (screenEl.dataset.view !== view) render();
}

function render() {
  const { settings, task, stats } = befit.state;
  const goggins = settings.goggins;
  const view = currentView();
  const pushups = task?.pushups ?? settings.pushups;

  screenEl.dataset.view = view;
  screenEl.classList.toggle("is-goggins", goggins);

  setText($("nextLabel"), goggins ? "Task:" : "Next:");
  setText($("nextPushups"), pushups);
  setText($("duePushups"), pushups);
  setText($("failedPushups"), pushups);
  setText($("streakCount"), stats.streak || 0);
  $("streak").classList.toggle("is-empty", !stats.streak);
  setText($("runningQuote"), task?.runningQuote || "");

  const kicker = $("dueKicker");
  setText(kicker, task?.prompt || "get off the screen.");
  kicker.classList.remove("is-wide");
  if (view === "due" && kicker.offsetWidth > 298) kicker.classList.add("is-wide");

  document.title = view === "timer" ? "be-fit" : "be-fit – Get Off The Screen.";
  renderClock();
}

async function refresh() {
  befit.state = await loadState();
  render();
  for (const fn of [...befit.listeners]) fn(befit.state);
  if (isReminder && !befit.state.dueSince) window.close();
}
befit.refresh = refresh;

/* ---------- Fail / Done / Ready ---------- */

async function complete(result) {
  stopSound();
  await befit.send({ type: "complete", result });
  await refresh();
  if (isReminder && !befit.state.dueSince) window.close();
}

$("failBtn").addEventListener("click", () => complete("fail"));
$("doneBtn").addEventListener("click", () => complete("done"));
$("readyBtn").addEventListener("click", async () => {
  await befit.send({ type: "ready" });
  await refresh();
});

/* ---------- reminder window ---------- */

befit.resizeWindow = async function resizeWindow(height = 302) {
  if (!isReminder || !ext.windows?.getCurrent) return;
  try {
    const win = await ext.windows.getCurrent();
    await ext.windows.update(win.id, {
      width: 702 + (window.outerWidth - window.innerWidth),
      height: height + (window.outerHeight - window.innerHeight),
    });
  } catch {
    /* resizing is best effort */
  }
};

befit.playAlarm = async function playAlarm(kindOverride, volumeOverride) {
  const { settings } = befit.state;
  const { customSound } = await ext.storage.local.get("customSound");
  const useCustom = !kindOverride && settings.customSoundOn && !settings.goggins && customSound?.dataUrl;
  const kind = kindOverride || (settings.goggins ? "siren" : settings.sound);
  try {
    await playSound(kind, volumeOverride ?? settings.volume, useCustom ? customSound.dataUrl : null);
  } catch {
    /* blocked until the page is touched */
  }
};

/* ---------- boot ---------- */

ext.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const keys = ["endsAt", "dueSince", "failedUntil", "settings", "rra", "task", "stats"];
  if (keys.some((key) => key in changes)) refresh();
});

ext.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "replay" && isReminder) befit.playAlarm();
  return false;
});

setInterval(renderClock, 250);

(async () => {
  await refresh();
  try {
    await befit.send({ type: "ensure" });
  } catch {
    /* background may still be starting */
  }
  await refresh();

  if (isReminder) {
    await befit.resizeWindow();
    befit.playAlarm();
    // Browsers may block sound until the page is touched: retry once on the first click.
    const retry = (event) => {
      if (event.target.closest("button")) return;
      document.removeEventListener("pointerdown", retry);
      if (typeof soundCtx === "undefined" || soundCtx?.state !== "running") befit.playAlarm();
    };
    document.addEventListener("pointerdown", retry);
  }
})();
