/**
 * Tailwind v4 @tailwindcss/node registers an ESM loader via Module.register, which
 * spawns a Worker. On resource-limited shared hosts this fails with EAGAIN.
 * Skipping register falls back to jiti for TS/ESM resolution (slightly slower, same output).
 * Runs after npm install — no need to vendor-upload node_modules.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(
  __dirname,
  "..",
  "node_modules",
  "@tailwindcss",
  "node",
  "dist",
  "index.js",
);

const needle = "process.versions.bun||_t.register?.";
const replacement = "true||_t.register?.";

if (!fs.existsSync(target)) {
  process.exit(0);
}

let s = fs.readFileSync(target, "utf8");
if (s.includes(replacement)) {
  process.exit(0);
}
if (!s.includes(needle)) {
  console.warn(
    "[postinstall] disable-tailwind-node-module-register: pattern not found; skip (tailwind upgrade?)",
  );
  process.exit(0);
}

fs.writeFileSync(target, s.replace(needle, replacement), "utf8");
