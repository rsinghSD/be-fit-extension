#!/usr/bin/env node
/*
 * Builds one folder per browser family into dist/:
 *   dist/chromium  Chrome, Edge, Brave, Opera, Arc …  (load unpacked / zip for the stores)
 *   dist/firefox   Firefox 121+                       (about:debugging → Load Temporary Add-on)
 *   dist/safari    Safari 16.4+ on macOS              (convert with Xcode, see README)
 *
 * Usage: node scripts/build.mjs [chromium|firefox|safari ...]
 * No dependencies; `zip` is used for store-ready archives when it is installed.
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src");
const dist = join(root, "dist");

const base = JSON.parse(await readFile(join(src, "manifest.json"), "utf8"));

const targets = {
  chromium: (m) => m,

  firefox: (m) => ({
    ...m,
    background: { scripts: ["shared.js", "background.js"] },
    browser_specific_settings: {
      gecko: {
        id: "be-fit@rsinghsd.github.io",
        strict_min_version: "121.0",
        data_collection_permissions: { required: ["none"] },
      },
    },
  }),

  // Safari has no notifications API; the reminder window covers it.
  safari: (m) => ({
    ...m,
    permissions: m.permissions.filter((p) => p !== "notifications"),
  }),
};

const requested = process.argv.slice(2);
const names = requested.length ? requested : Object.keys(targets);

let hasZip = true;
try {
  execFileSync("zip", ["-v"], { stdio: "ignore" });
} catch {
  hasZip = false;
}

for (const name of names) {
  const transform = targets[name];
  if (!transform) {
    console.error(`Unknown target "${name}". Use: ${Object.keys(targets).join(", ")}`);
    process.exit(1);
  }
  const out = join(dist, name);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(src, out, { recursive: true, filter: (p) => !p.endsWith("manifest.json") });
  await writeFile(join(out, "manifest.json"), JSON.stringify(transform(structuredClone(base)), null, 2) + "\n");

  if (hasZip && name !== "safari") {
    const archive = join(dist, `be-fit-${name}-${base.version}.zip`);
    await rm(archive, { force: true });
    execFileSync("zip", ["-qr", archive, "."], { cwd: out });
  }
  console.log(`built dist/${name}`);
}
