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
- **Configure Window** (gear icon) – interval timer 5–60 min, push-ups 1–50, alarm volume 1–100 %. Hit **Save**.
- **Time's up** – a 702×302 window pops up with *Get Off The Screen. Do N Push-Ups.*, plays a short alarm at your volume and puts a `!` badge on the icon. Press **Done** or **Fail**; both get logged (total push-ups, done/failed counts), then the next interval starts.

The UI is built 1:1 from the Figma frames in *V1 Chrome Extension Start*. Fonts (DM Sans and Inter) are bundled, so there are no network requests.

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
  background.js   interval timer (alarms), time's-up window, Done/Fail log
  shared.js       browser API shim + settings defaults/ranges
  popup.html/css/js  Main Screen, time's-up screen, Configure Window
  assets/         SVGs exported from Figma
  fonts/          DM Sans + Inter (OFL)
  icons/          toolbar icons
scripts/build.mjs per-browser builds
```

## Credits

Fonts: [DM Sans](https://fonts.google.com/specimen/DM+Sans) and [Inter](https://fonts.google.com/specimen/Inter), SIL Open Font License. Icons from https://www.flaticon.com
