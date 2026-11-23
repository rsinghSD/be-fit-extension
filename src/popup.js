/*
 * be-fit popup. Used twice:
 *   - as the toolbar popup (popup.html)
 *   - as the time's-up window the background opens (popup.html?view=reminder)
 */
/* global ext, loadState, clampSetting, DEFAULT_SETTINGS */

const isReminder = new URLSearchParams(location.search).get("view") === "reminder";
const MENU_EXTRA_HEIGHT = 107; // settings panel hangs 107px below the 302px screen

const $ = (id) => document.getElementById(id);
const screenEl = $("screen");
const countdownEl = $("countdown");
const nextPushupsEl = $("nextPushups");
const duePushupsEl = $("duePushups");
const settingsBtn = $("settingsBtn");
const menu = $("settingsMenu");
const sliders = [...menu.querySelectorAll(".slider")];

let state = { settings: { ...DEFAULT_SETTINGS }, endsAt: null, dueSince: null };

/* ---------- rendering ---------- */

function formatRemaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderCountdown() {
  const remaining = state.endsAt
    ? state.endsAt - Date.now()
    : state.settings.intervalMinutes * 60 * 1000;
  const text = formatRemaining(remaining);
  if (countdownEl.textContent !== text) countdownEl.textContent = text;
}

function render() {
  const due = Boolean(state.dueSince);
  screenEl.dataset.view = due ? "due" : "timer";
  nextPushupsEl.textContent = state.settings.pushups;
  duePushupsEl.textContent = state.settings.pushups;
  document.title = due ? "be-fit – Get Off The Screen." : "be-fit";
  renderCountdown();
}

async function refresh() {
  state = await loadState();
  render();
  if (isReminder && !state.dueSince) window.close();
}

/* ---------- settings menu ---------- */

const outputTimers = new WeakMap();

function setOutput(slider, showValue) {
  const output = slider.closest(".slider-field").querySelector(".slider-field__output");
  const { unit, range } = output.dataset;
  output.textContent = `${unit} ${showValue ? slider.value : range}`;
}

function fillSliders() {
  for (const slider of sliders) {
    slider.value = state.settings[slider.name];
    setOutput(slider, false);
  }
}

async function resizeReminderWindow(extraHeight) {
  if (!isReminder || !ext.windows?.getCurrent) return;
  try {
    const win = await ext.windows.getCurrent();
    const chromeW = window.outerWidth - window.innerWidth;
    const chromeH = window.outerHeight - window.innerHeight;
    await ext.windows.update(win.id, {
      width: 702 + chromeW,
      height: 302 + extraHeight + chromeH,
    });
  } catch {
    /* resizing is best effort */
  }
}

function setMenuOpen(open) {
  if (open) fillSliders();
  menu.hidden = !open;
  document.body.classList.toggle("menu-open", open);
  settingsBtn.setAttribute("aria-expanded", String(open));
  resizeReminderWindow(open ? MENU_EXTRA_HEIGHT : 0);
  if (open) sliders[0].focus({ preventScroll: true });
}

settingsBtn.addEventListener("click", (event) => {
  event.stopPropagation();
  setMenuOpen(menu.hidden);
});

document.addEventListener("click", (event) => {
  if (!menu.hidden && !menu.contains(event.target)) setMenuOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !menu.hidden) {
    setMenuOpen(false);
    settingsBtn.focus();
  }
});

for (const slider of sliders) {
  // Show the picked value while sliding, then fall back to the range label from the design.
  slider.addEventListener("input", () => {
    setOutput(slider, true);
    clearTimeout(outputTimers.get(slider));
    outputTimers.set(slider, setTimeout(() => setOutput(slider, false), 1200));
  });
}

menu.querySelector('[name="volume"]').addEventListener("change", (event) => {
  playAlarm(Number(event.target.value), 1);
});

$("saveBtn").addEventListener("click", async () => {
  const next = { ...state.settings };
  for (const slider of sliders) next[slider.name] = clampSetting(slider.name, slider.value);
  const intervalChanged = next.intervalMinutes !== state.settings.intervalMinutes;

  await ext.storage.local.set({ settings: next });
  if (intervalChanged && !state.dueSince) await ext.runtime.sendMessage({ type: "restart" });
  setMenuOpen(false);
  await refresh();
});

/* ---------- Fail / Done ---------- */

async function complete(result) {
  await ext.runtime.sendMessage({ type: "complete", result });
  if (isReminder) window.close();
  else await refresh();
}

$("failBtn").addEventListener("click", () => complete("fail"));
$("doneBtn").addEventListener("click", () => complete("done"));

/* ---------- alarm sound (generated, no audio file needed) ---------- */

let audioCtx;

function playAlarm(volumePercent, beeps = 3) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const peak = Math.max(0.0001, (volumePercent / 100) * 0.6);
    const start = audioCtx.currentTime + 0.05;
    for (let i = 0; i < beeps; i++) {
      const t = start + i * 0.28;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    /* audio is optional */
  }
}

/* ---------- boot ---------- */

ext.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("endsAt" in changes || "dueSince" in changes || "settings" in changes)) {
    refresh();
  }
});

setInterval(renderCountdown, 250);

(async () => {
  await refresh();
  try {
    await ext.runtime.sendMessage({ type: "ensure" });
  } catch {
    /* background may still be starting */
  }
  await refresh();

  if (isReminder) {
    await resizeReminderWindow(0);
    playAlarm(state.settings.volume);
    // Browsers may block sound until the page is touched; retry on first interaction.
    document.addEventListener("pointerdown", () => audioCtx?.resume(), { once: true });
  }
})();
