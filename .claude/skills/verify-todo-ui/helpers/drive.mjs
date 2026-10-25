#!/usr/bin/env node
// Runs one journey against the instance this run started, and writes its evidence.
//
// Usage: helpers/drive.mjs <RUN_ID> <journey.mjs>
//
// A journey is an ES module with a default export:
//
//   export default async ({ page, app, ev, check }) => {
//     await page.goto(`${app}/index.html`);
//     await page.click('[data-view="list"]');
//     check(await page.locator('#view .row').count() === 12, '12 rows render');
//     await ev.shot('list');
//   };
//
// page   Playwright page, viewport 1320x940, already on the app.
// app    base URL of this run's instance.
// ev     ev.shot(name), ev.aria(name, selector), ev.json(name, data), ev.text(name, string).
// check  check(condition, label) records a pass or fail and sets the exit code.
//
// Exits non-zero when any check fails or the page logs a console error.

import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const [runId, journeyArg] = process.argv.slice(2);
if (!runId || !journeyArg) {
  console.error('usage: drive.mjs <RUN_ID> <journey.mjs>');
  process.exit(2);
}

const runDir = join(repo, 'verification', runId, '.run');
const evidence = join(repo, 'verification', runId);
const port = readFileSync(join(runDir, 'port'), 'utf8').trim();
const app = `http://127.0.0.1:${port}`;
mkdirSync(evidence, { recursive: true });

const [chrome, libDir] = execFileSync(join(here, 'ensure-chrome.sh'), { encoding: 'utf8' }).trim().split('\n');

const results = [];
const artifacts = [];
function check(ok, label) {
  results.push({ ok: Boolean(ok), label });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
}

const browser = await chromium.launch({
  executablePath: chrome,
  env: { ...process.env, LD_LIBRARY_PATH: `${libDir}:${process.env.LD_LIBRARY_PATH ?? ''}` },
});
const page = await browser.newPage({ viewport: { width: 1320, height: 940 }, deviceScaleFactor: 2 });

const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

const save = (name, body) => {
  const file = join(evidence, name);
  writeFileSync(file, body);
  artifacts.push(name);
};

const ev = {
  async shot(name, opts = {}) {
    await page.screenshot({ path: join(evidence, `${name}.png`), fullPage: true, ...opts });
    artifacts.push(`${name}.png`);
  },
  async aria(name, selector = 'body') {
    save(`${name}.aria.txt`, await page.locator(selector).ariaSnapshot());
  },
  json(name, data) {
    save(`${name}.json`, JSON.stringify(data, null, 2));
  },
  text(name, body) {
    save(`${name}.txt`, String(body));
  },
};

let crashed = null;
try {
  await page.goto(`${app}/index.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const journey = await import(pathToFileURL(resolve(journeyArg)).href);
  await journey.default({ page, app, ev, check });
} catch (e) {
  crashed = String(e);
  check(false, `journey threw: ${crashed.split('\n')[0]}`);
}

check(consoleErrors.length === 0, `no console errors (${consoleErrors.length})`);
consoleErrors.forEach((e) => console.log(`      ${e}`));

await browser.close();

const failed = results.filter((r) => !r.ok).length;
writeFileSync(
  join(evidence, 'summary.json'),
  JSON.stringify({ runId, journey: journeyArg, app, when: new Date().toISOString(), results, consoleErrors, artifacts, failed }, null, 2)
);

console.log(`\nartifacts in verification/${runId}/`);
console.log(failed === 0 ? 'JOURNEY PASSED' : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
