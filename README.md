# be-fit push-up interval timer
A free open-source browser extension that reminds everyone staring at a screen to stay fit and drop 20.

Why? Because we should care about our health. Studies show that sitting too much weakens your joints, muscles, and overall energy. The least you can do is drop some push-ups and eventually, add stretching and mini workouts into your daily grind.

Design (Figma):
https://www.figma.com/design/eQXeCBw1PIXwc631fzlvVX/be-fit-ui-design?node-id=0-1&t=GkbP8n8TgRSFd8nJ-1

## Why did i make this?
I made this because most people are busy with work on their screens for 8 hours long. I wanted to create something that **forces you to move**, even for 30 seconds, reminding you that **discipline starts with small action**. Push-ups are just the start of building a habit.

Contributions are welcome! Make a pull-request though.

## What it does

- **Main Screen** – counts down to your next set (`15:00`, `Next: 10 Push-Ups`).
- **Time's up** – a 702×302 window and/or a push notification: *Do N Push-Ups.* under a rotating prompt (*Get off the screen.*, *Level up your body.*, …). An alarm plays at your volume and a `!` badge appears on the icon. **Done** or **Fail** gets logged, then the next interval starts.
- **be-fit menu** (gear icon, or the shortcuts from any screen):

  | Shortcut | Page | What it does |
  | --- | --- | --- |
  | ⇧S | Total High Score | Push-ups and intervals since you installed, **Share** (or copy) it, **Reset?** |
  | ⇧Q | Change Interval/Reps | Interval 5–60 min, reps 1–100, loudness 1–100 %, *Enable randomized reps?* |
  | ⇧C | Change notifications | Popup, Push or both, plus the alarm sound |
  | ⇧G | Goggins Mode | Hold **SPACE** for 5 s, then again on the last warning |
  | ⇧A | Change alarm sound | Built-in sounds, or upload your own audio file (5 MB max) |
  | ⇧I | About/Author | The project, CoreControl and the founder |

- **Randomized Reps Configuration** – a three-step onboarding (max push-ups, comfortable reps, recovery speed). It runs the first time you enable randomized reps or Goggins Mode. Reps are then drawn by the "randomizer + fatigue system" from the design: `minReps = max(comfortable, max × min%)`, `maxReps = max × max%`, with fatigue `max(0.7, 1 − setsToday × 0.05)`.
- **Goggins Mode** – random intervals (2–20 min) and reps at 70–100 % of your max. Insulting quotes, a 🔥 streak and a siren. Push and popup are both forced on. **Fail** gives you a 60-second break ("Oh you failed? …"), then the alarm goes again.

The UI is built 1:1 from the Figma frames: *V1 Chrome Extension Start*, *V2 full app design*, *Menu Options*, *Randomizer Onboarding*, *Type of quotes* and *Goggins Mode*. Fonts (DM Sans and Inter) are bundled, so there are no network requests.

Browser popups can't be taller than 600px, so the 686px menu scrolls.

### Stand-in assets

The Figma image and icon exports weren't available when V2 was built, so these files are stand-ins. Export the real ones from Figma under the same names and they drop straight in:

| File | Figma layer |
| --- | --- |
| `src/assets/v2/author.png` | About/Author → `image 1` (65×65, founder photo) |
| `src/assets/v2/corecontrol.png` | About/Author → `CORE CONTROL LOGO TRANSPARANT PF HEADERpng 1` (325×118). The stand-in is only the wordmark, without the torso illustration |
| `src/assets/v2/pushup.svg` | Total High Score → `pushup image transparant` (traced from the be-fit logo) |
| `src/assets/v2/icon-*.svg` | Menu icons (`alarm-clock`, `bell-ring`, `general`, `info`, the waveform, `dumbbell bg-less`, `Share`). These are [Lucide](https://lucide.dev) icons, except `icon-score.svg`, which is rebuilt from the Figma vectors, and `icon-goggins.svg`, which is hand-drawn |

## Supported browsers

| Browser | Folder | Notes |
| --- | --- | --- |
| Chrome, Edge, Brave, Opera, Arc | `dist/chromium` | Manifest V3 service worker |
| Firefox 121+ | `dist/firefox` | Manifest V3 event page |
| Safari 16.4+ (macOS) | `dist/safari` | Needs Xcode to wrap it in an app (see below) |

## Build

Needs Node 18+ and nothing else (no dependencies).

```bash
npm run build
```

This writes `dist/chromium`, `dist/firefox` and `dist/safari`. If `zip` is installed, it also writes store-ready zips for Chromium and Firefox.

## Install for development

**Chrome / Edge / Brave:** open `chrome://extensions` (or `edge://extensions`), switch on *Developer mode*, click **Load unpacked** and pick `dist/chromium`. You can also load `src/` directly; it is the Chromium build.

**Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…** and pick `dist/firefox/manifest.json`.

**Safari (macOS + Xcode):**

```bash
npm run safari:xcode
```

Open the generated project in `dist/safari-xcode`, run the **be-fit (macOS)** scheme, then enable the extension in Safari → Settings → Extensions. For unsigned dev builds, first turn on Develop → *Allow Unsigned Extensions*.

## Project layout

```
src/
  manifest.json   base manifest (Chromium); scripts/build.mjs derives Firefox/Safari
  background.js   interval timer (alarms), reps/intervals, popup + push alerts, Done/Fail log
  shared.js       browser API shim, settings, rep randomizer, prompts and Goggins quotes
  sound.js        generated alarm sounds (Web Audio) + custom sound playback
  offscreen.*     Chromium only: plays the alarm when only a push notification is shown
  popup.html/css/js  Main Screen, time's-up and Goggins screens
  menu.css/js     be-fit menu and all its pages
  assets/         SVGs exported from Figma; assets/v2 holds the V2 icons and images
  fonts/          DM Sans + Inter (OFL)
  icons/          toolbar icons
scripts/build.mjs per-browser builds
```

## Credits

Fonts: [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [Inter](https://fonts.google.com/specimen/Inter), SIL Open Font License. Settings icon from https://www.flaticon.com. Stand-in menu icons from [Lucide](https://lucide.dev), ISC License (`src/assets/v2/LUCIDE-LICENSE.txt`).
