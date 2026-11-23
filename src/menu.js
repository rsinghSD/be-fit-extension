/*
 * be-fit menu: navigation, keyboard shortcuts (⇧S, ⇧Q, ⇧C, ⇧G, ⇧A, ⇧I) and
 * the logic behind every menu page.
 */
/* global ext, befit, clampSetting, supportsPush, NOTIFY_TYPES, SOUNDS,
   RECOVERY_LEVELS, REPO_URL, playSound */

(() => {
  const $ = (id) => document.getElementById(id);
  const menu = $("menu");
  const settingsBtn = $("settingsBtn");
  const pages = new Map([...menu.querySelectorAll(".page")].map((p) => [p.dataset.page, p]));

  const HOLD_MS = 5000;
  const MAX_CUSTOM_SOUND_BYTES = 5 * 1024 * 1024;

  let stack = [];
  let rraReturn = null; // page to land on after the Randomized Reps Configuration

  const homePage = () => (befit.state.settings.goggins ? "home-goggins" : "home");
  const current = () => stack[stack.length - 1];

  /* ---------- navigation ---------- */

  function show(name) {
    for (const [key, page] of pages) page.classList.toggle("is-active", key === name);
    const page = pages.get(name);
    const height = parseFloat(page.style.getPropertyValue("--h")) || 405;
    menu.style.setProperty("--menu-h", `${height}px`);
    menu.scrollTop = 0;
    const bodyHeight = Math.min(600, 4 + height);
    document.body.style.setProperty("--body-h", `${bodyHeight}px`);
    befit.resizeWindow(bodyHeight);
    PAGE_INIT[name]?.(page);
  }

  function open(name = homePage()) {
    stack = name === homePage() ? [name] : [homePage(), name];
    menu.hidden = false;
    document.body.classList.add("menu-open");
    settingsBtn.setAttribute("aria-expanded", "true");
    show(name);
  }

  function close() {
    cancelHold();
    stack = [];
    rraReturn = null;
    menu.hidden = true;
    document.body.classList.remove("menu-open");
    settingsBtn.setAttribute("aria-expanded", "false");
    befit.resizeWindow(302);
  }

  function go(name) {
    if (menu.hidden) return open(name);
    cancelHold();
    stack.push(name);
    show(name);
  }

  function back() {
    cancelHold();
    if (stack.length <= 1) return close();
    stack.pop();
    show(current());
  }

  /* jump to `name`, dropping everything above an earlier visit of it */
  function returnTo(name) {
    const index = stack.lastIndexOf(name);
    if (index >= 0) stack = stack.slice(0, index + 1);
    else stack.push(name);
    show(name);
  }

  befit.menu = { open, close, go, back };

  settingsBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) open();
    else close();
  });

  document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !befit.isTab) close();
  });

  menu.addEventListener("click", (event) => {
    const target = event.target.closest("[data-go], [data-back]");
    if (!target) return;
    if (target.hasAttribute("data-back")) back();
    else go(target.dataset.go);
  });

  /* ---------- keyboard ---------- */

  document.addEventListener("keydown", (event) => {
    const typing = event.target.closest?.("input:not([type=range]):not([type=checkbox]), select");

    if (event.key === "Escape" && !menu.hidden) {
      event.preventDefault();
      back();
      if (menu.hidden) settingsBtn.focus();
      return;
    }

    if (event.code === "Space" && !event.repeat && current()?.startsWith("goggins")) {
      const hold = pages.get(current()).querySelector("[data-hold]");
      if (hold) {
        event.preventDefault();
        startHold(hold);
      }
      return;
    }

    if (typing || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return;
    const letter = event.key.toUpperCase();
    const item = pages.get(homePage()).querySelector(`.mitem[data-key="${letter}"]`);
    if (!item) return;
    event.preventDefault();
    if (menu.hidden) {
      open(item.dataset.go);
    } else {
      returnTo(homePage());
      go(item.dataset.go);
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.code === "Space") cancelHold();
  });

  /* ---------- settings helpers ---------- */

  async function saveSettings(patch, then) {
    const settings = { ...befit.state.settings, ...patch };
    befit.state.settings = settings;
    await ext.storage.local.set({ settings });
    if (then) await befit.send({ type: then });
  }

  function toast(id, text) {
    const el = $(id);
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }

  function preview(kind) {
    befit.playAlarm(kind, befit.state.settings.volume);
  }

  /* ---------- "slider diy" ---------- */

  function syncSlider(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const fraction = (Number(input.value) - min) / (max - min);
    const width = input.getBoundingClientRect().width || Number.parseFloat(getComputedStyle(input).width);
    const knobX = 9 + fraction * (width - 18);
    input.style.setProperty("--fill", `${knobX}px`);
    const label = input.parentElement.querySelector(".diy__value");
    if (!label) return;
    label.style.setProperty("--knob-x", `${knobX}px`);
    if (input.name === "recovery") label.textContent = RECOVERY_LEVELS[input.value].label;
    else label.textContent = input.value + (label.dataset.suffix || "");
  }

  for (const input of menu.querySelectorAll(".diy__input")) {
    input.addEventListener("input", () => syncSlider(input));
  }

  /* ---------- per-page setup ---------- */

  const PAGE_INIT = {
    score() {
      const { stats } = befit.state;
      $("scoreSince").textContent = new Date(stats.since || Date.now())
        .toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
        .toLowerCase();
      $("scorePushups").textContent = stats.totalPushups || 0;
      $("scoreIntervals").textContent = stats.done || 0;
      disarmReset();
    },

    interval(page) {
      const { settings, rra } = befit.state;
      for (const input of page.querySelectorAll(".diy__input")) {
        input.value = settings[input.name];
        syncSlider(input);
      }
      const random = page.querySelector('[name="randomReps"]');
      random.checked = settings.randomReps && rra.done;
      $("repsField").classList.toggle("is-disabled", random.checked);
    },

    notifications(page) {
      const { settings } = befit.state;
      const type = page.querySelector('[name="notifyType"]');
      const types = supportsPush() ? NOTIFY_TYPES : { popup: NOTIFY_TYPES.popup };
      fillSelect(type, types, settings.goggins ? "both" : settings.notifyType);
      type.disabled = settings.goggins || !supportsPush();
      fillSelect(page.querySelector('[name="sound"]'), SOUNDS, settings.goggins ? "siren" : settings.sound);
      page.querySelector('[name="sound"]').disabled = settings.goggins;
    },

    async sound(page) {
      const { settings } = befit.state;
      fillSelect(page.querySelector('[name="sound"]'), SOUNDS, settings.goggins ? "siren" : settings.sound);
      page.querySelector('[name="sound"]').disabled = settings.goggins;
      const toggle = page.querySelector('[name="customSoundOn"]');
      toggle.checked = settings.customSoundOn && !settings.goggins;
      toggle.disabled = settings.goggins;
      const { customSound } = await ext.storage.local.get("customSound");
      $("customSoundName").textContent = customSound?.name || "none yet";
      syncCustomSound();
    },

    about() {
      $("joinBtn").href = REPO_URL;
      $("ossLink").href = REPO_URL;
    },

    "rra-1"(page) {
      page.querySelector("input").value = befit.state.rra.maxPushups;
    },

    "rra-2"(page) {
      page.querySelector("input").value = befit.state.rra.comfortable;
    },

    "rra-3"(page) {
      const input = page.querySelector('[name="recovery"]');
      input.value = befit.state.rra.recovery;
      requestAnimationFrame(() => syncSlider(input));
    },
  };

  function fillSelect(select, options, value) {
    select.replaceChildren(
      ...Object.entries(options).map(([key, label]) => new Option(label, key, false, key === value))
    );
    select.value = value in options ? value : Object.keys(options)[0];
  }

  /* ---------- Total High Score ---------- */

  $("shareBtn").addEventListener("click", async () => {
    const { stats } = befit.state;
    const text = `I've done ${stats.totalPushups || 0} push-ups in ${stats.done || 0} intervals with be-fit. Discipline starts with small action. ${REPO_URL}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "be-fit", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toast("scoreToast", "Copied – go brag about it.");
    } catch (err) {
      if (err?.name !== "AbortError") toast("scoreToast", "Couldn't share right now.");
    }
  });

  const resetBtn = $("resetBtn");
  let resetTimer;
  function disarmReset() {
    clearTimeout(resetTimer);
    resetBtn.classList.remove("is-armed");
    resetBtn.textContent = "Reset?";
  }
  resetBtn.addEventListener("click", async () => {
    if (!resetBtn.classList.contains("is-armed")) {
      resetBtn.classList.add("is-armed");
      resetBtn.textContent = "Sure?";
      resetTimer = setTimeout(disarmReset, 3000);
      return;
    }
    disarmReset();
    await befit.send({ type: "reset-stats" });
    await befit.refresh();
    PAGE_INIT.score();
    toast("scoreToast", "Score reset. Start again.");
  });

  /* ---------- Change Interval/Reps ---------- */

  const intervalPage = pages.get("interval");
  intervalPage.querySelector('[name="intervalMinutes"]').addEventListener("change", (event) => {
    saveSettings({ intervalMinutes: clampSetting("intervalMinutes", event.target.value) }, "restart");
  });
  intervalPage.querySelector('[name="pushups"]').addEventListener("change", (event) => {
    saveSettings({ pushups: clampSetting("pushups", event.target.value) }, "retask");
  });
  intervalPage.querySelector('[name="volume"]').addEventListener("change", async (event) => {
    await saveSettings({ volume: clampSetting("volume", event.target.value) });
    preview();
  });
  intervalPage.querySelector('[name="randomReps"]').addEventListener("change", async (event) => {
    const on = event.target.checked;
    if (on && !befit.state.rra.done) {
      event.target.checked = false;
      rraReturn = { page: "interval", enableRandom: true };
      go("rra-1");
      return;
    }
    $("repsField").classList.toggle("is-disabled", on);
    await saveSettings({ randomReps: on }, "retask");
  });

  /* ---------- Change Notifications ---------- */

  const notifPage = pages.get("notifications");
  notifPage.querySelector('[name="notifyType"]').addEventListener("change", (event) => {
    saveSettings({ notifyType: event.target.value });
  });
  for (const select of menu.querySelectorAll('select[name="sound"]')) {
    select.addEventListener("change", async (event) => {
      await saveSettings({ sound: event.target.value });
      preview(event.target.value);
    });
  }
  $("setupAgentBtn").addEventListener("click", () => {
    toast("notifToast", "The be-fit agent is coming soon.");
  });

  /* ---------- Change Alarm Sound ---------- */

  const soundPage = pages.get("sound");
  const customToggle = soundPage.querySelector('[name="customSoundOn"]');

  function syncCustomSound() {
    const on = customToggle.checked;
    $("customSound").classList.toggle("is-disabled", !on);
    $("editSoundBtn").disabled = !on;
  }

  customToggle.addEventListener("change", async () => {
    syncCustomSound();
    const { customSound } = await ext.storage.local.get("customSound");
    await saveSettings({ customSoundOn: customToggle.checked });
    if (customToggle.checked && !customSound) $("editSoundBtn").click();
  });

  $("editSoundBtn").addEventListener("click", () => {
    // A file dialog closes toolbar popups in some browsers, so pick the file in a tab.
    if (!befit.isTab && !befit.isReminder) {
      ext.tabs.create({ url: ext.runtime.getURL("popup.html?tab=1&page=sound") });
      window.close();
      return;
    }
    $("soundFile").click();
  });

  $("soundFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_CUSTOM_SOUND_BYTES) {
      toast("soundToast", "That file is too big (5 MB max).");
      return;
    }
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    try {
      await playSound("alarm", befit.state.settings.volume, dataUrl);
    } catch {
      toast("soundToast", "Your browser can't play that file.");
      return;
    }
    await ext.storage.local.set({ customSound: { name: file.name, dataUrl } });
    await saveSettings({ customSoundOn: true });
    $("customSoundName").textContent = file.name;
    customToggle.checked = true;
    syncCustomSound();
    toast("soundToast", "Custom alarm saved.");
  });

  /* ---------- Goggins Mode: hold SPACE for 5 seconds ---------- */

  let hold = null;

  function startHold(button) {
    if (hold) return;
    const startedAt = performance.now();
    button.classList.add("is-holding");
    const tick = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / HOLD_MS);
      button.style.setProperty("--progress", `${progress * 100}%`);
      if (progress >= 1) {
        cancelHold();
        holdComplete(button.dataset.hold);
        return;
      }
      hold.frame = requestAnimationFrame(tick);
    };
    hold = { button, frame: requestAnimationFrame(tick) };
  }

  function cancelHold() {
    if (!hold) return;
    cancelAnimationFrame(hold.frame);
    hold.button.classList.remove("is-holding");
    hold.button.style.setProperty("--progress", "0%");
    hold = null;
  }

  for (const button of menu.querySelectorAll("[data-hold]")) {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      startHold(button);
    });
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
      button.addEventListener(type, cancelHold);
    }
    button.addEventListener("click", (event) => event.preventDefault());
  }

  async function holdComplete(step) {
    if (step === "goggins-1") {
      // step one: the Randomized Reps Algorithm has to be configured first
      if (!befit.state.rra.done) {
        rraReturn = { page: "goggins-confirm" };
        go("rra-1");
      } else go("goggins-confirm");
      return;
    }
    if (step === "goggins-2") {
      await saveSettings({ goggins: true }, "restart");
      await befit.refresh();
      close();
    }
  }

  $("gogginsOffBtn").addEventListener("click", async () => {
    await saveSettings({ goggins: false }, "restart");
    await befit.refresh();
    open("home");
  });

  /* ---------- Randomized Reps Configuration ---------- */

  pages.get("rra-3").querySelector('[name="recovery"]').addEventListener("input", (event) => {
    syncSlider(event.target);
  });

  menu.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-continue]");
    if (!button) return;
    const page = button.closest(".page");
    const rra = { ...befit.state.rra };
    for (const input of page.querySelectorAll("input")) {
      const value = Math.round(Number(input.value));
      if (input.type === "number") {
        if (!Number.isFinite(value) || value < 1) {
          input.focus();
          return;
        }
        rra[input.name] = Math.min(300, value);
      } else rra[input.name] = value;
    }
    rra.comfortable = Math.min(rra.comfortable, rra.maxPushups);
    befit.state.rra = rra;

    if (button.dataset.continue !== "finish") {
      await ext.storage.local.set({ rra });
      go(button.dataset.continue);
      return;
    }

    rra.done = true;
    befit.state.rra = rra;
    await ext.storage.local.set({ rra });
    const target = rraReturn || { page: "interval", enableRandom: true };
    rraReturn = null;
    if (target.enableRandom) await saveSettings({ randomReps: true }, "retask");
    else await befit.send({ type: "retask" });
    // drop the onboarding pages from the history
    stack = stack.filter((name) => !name.startsWith("rra-"));
    returnTo(target.page);
  });

  for (const input of menu.querySelectorAll(".rra__input")) {
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") input.closest(".page").querySelector("[data-continue]").click();
    });
  }

  /* ---------- keep open pages in sync ---------- */

  let wasDue = null;
  befit.onChange((state) => {
    const due = Boolean(state.dueSince);
    const becameDue = wasDue === false && due;
    wasDue = due;
    if (menu.hidden) return;
    // time's up: get the menu out of the way of Fail/Done (not in a settings tab)
    if (becameDue && !befit.isTab) {
      close();
      return;
    }
    const name = current();
    // swap the home page when Goggins Mode flips
    if (name === "home" || name === "home-goggins") {
      if (name !== homePage()) {
        stack[stack.length - 1] = homePage();
        show(homePage());
      }
    } else if (name === "score") PAGE_INIT.score();
  });

  const startPage = new URLSearchParams(location.search).get("page");
  if (startPage && pages.has(startPage)) {
    // wait for the first state load so the page shows real values
    const once = () => {
      befit.listeners.splice(befit.listeners.indexOf(once), 1);
      open(startPage);
    };
    befit.onChange(once);
  }
})();
