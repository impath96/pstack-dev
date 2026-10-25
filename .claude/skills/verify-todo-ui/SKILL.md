---
name: verify-todo-ui
description: Drive the todo app at src/ the way a user does and capture proof. Launches an isolated static instance, runs a journey through Playwright Chromium, and writes screenshots, ARIA snapshots and a check summary under verification/<RUN_ID>/. Reach for it to prove a UI change works in the real app rather than only in tests, to check a persistence or storage-failure path, or to screenshot the list.
---

# Verify the todo UI

The app is a browser UI at `src/`. There is no backend, no database and no auth.
`index.html` loads one ES module and the browser resolves the rest. State lives in one
reducer-owned object and persists to `localStorage`, seeded from `SEED` on a first visit
with empty storage.

**A reload is not a reset.** Persistence means a journey inherits whatever the previous one
left. Get a clean slate two ways. A new `RUN_ID` gets a new free port, and a new port is a
new origin, so its `localStorage` starts empty. Within one run, load `?reset=seed` to clear
stored data and reload the seed.

`.scratch/todo-layouts` still holds the throwaway layout prototype that chose this layout.
It is not what this skill drives any more, and its card and kanban views no longer exist in
the product.

## Launch

One instance per run, isolated by `RUN_ID`. The launcher picks a free port, so two runs
never collide.

```bash
RUN_ID="todo-$(date +%s)"
.claude/skills/verify-todo-ui/helpers/launch.sh "$RUN_ID" src
# prints: READY http://127.0.0.1:<port>/index.html
```

The second argument is the app directory. It defaults to the old prototype, so pass `src`.

Ready means the port serves this app, not merely that a socket answers. The launcher polls
until the response body contains `<meta name="app" content="todo-app">`, so a stray server
holding the port fails the wait instead of passing it. That marker is the contract: if you
move or rename it in `index.html`, `launch.sh` and `doctor.sh` both stop working. It writes `verification/$RUN_ID/.run/` with `server.pid`,
`port`, `app_dir` and `server.log`.

There is no migration step to run and no data directory. The seed is source code and loads
itself on a first visit with empty storage.

## Doctor

Run this first whenever anything looks off. It is read-only: it downloads nothing, starts
nothing and changes nothing.

```bash
.claude/skills/verify-todo-ui/helpers/doctor.sh "$RUN_ID"
```

It checks the five app files exist, Chromium is present and all its shared libraries
resolve, `playwright-core` resolves, the recorded pid is alive, and the recorded port
serves this app rather than something else that grabbed it. It exits non-zero and prints
`DOCTOR FAILED` when any check fails.

Chromium here needs `libnss3`, `libnspr4` and `libasound2`, which are not installed
system-wide and whose install needs a sudo password. `helpers/ensure-chrome.sh` unpacks the
Ubuntu packages into `~/.cache/claude-chrome-deps` instead, with no sudo. It is idempotent
and `drive.mjs` calls it automatically. Run it by hand only when doctor reports missing
libraries.

## Drive

Write a journey as an ES module, then run it. Journeys are cheap and disposable. The
feature files under `features/` give the exact steps and selectors for each feature.

```bash
.claude/skills/verify-todo-ui/helpers/drive.mjs "$RUN_ID" path/to/journey.mjs
```

A journey receives four things:

```js
export default async ({ page, app, ev, check }) => {
  await page.click('[data-view="list"]');
  check((await page.locator('#view .row').count()) === 12, 'list shows all 12 todos');
  await ev.shot('list');
};
```

`page` is a Playwright page at 1320x940, already loaded and with fonts ready. `app` is this
run's base URL. `ev` writes evidence with `ev.shot(name)`, `ev.aria(name, selector)`,
`ev.json(name, data)` and `ev.text(name, body)`. `check(condition, label)` records a result
and sets the exit code. The harness fails the run on any console error without being asked.

`journeys/status-advance.mjs` is a worked example that drives
`features/status-advance.md` end to end. Run it as-is to confirm the harness works before
writing a new journey:

```bash
.claude/skills/verify-todo-ui/helpers/drive.mjs "$RUN_ID" \
  .claude/skills/verify-todo-ui/journeys/status-advance.mjs
```

Wait for `body[data-ready="true"]` before asserting. It is set after the first render.

Use stable handles. `#view` is the list container, `.group[data-status]` a group header
with no `data-id`, and `.row[data-id="<n>"][data-status]` one todo, carrying
`data-overdue` when it is overdue. Row controls are `[data-advance]`, `[data-edit]` and
`[data-delete]`, each keyed by the todo id. The header carries `[data-create]`, the undo
affordance `[data-undo]`, and the storage banner is `#notice[data-notice="<kind>"]`. The
editor dialog uses `[data-field="<name>"]`, `[data-submit]` and `[data-cancel]`.

Do not select by text position or nth-child. Items sort by priority, then due date, then
id, so positions move.

To assert the editor closed, wait for `page.waitForSelector('#editor', { state: 'hidden' })`.
A closed `<dialog>` is hidden rather than removed, so the default visible-state wait on
`#editor:not([open])` times out instead of passing.

`window.store` is a frozen read-only facade with `todos`, `byStatus`, `canMove` and
`allowedTargets`. It has no write method, so a journey cannot set state around the UI. Use
`canMove` to prove a forbidden transition is refused: the UI never renders an illegal
target, so there is no illegal click to attempt.

## Evidence

Artifacts go to `verification/$RUN_ID/` and that path is named in the harness output.
`summary.json` records every check, the console errors, the journey file and the artifact
list.

Proof standards for this app:

- Drive the real user path. Click `[data-advance]` or drag a card. Never call
  `store.move()` from `page.evaluate` to produce a result, because that skips the view code
  the change is meant to prove.
- Capture the action and the resulting state, not only the final screen. Screenshot before
  and after a mutation, or pair the screenshot with the DOM state that changed.
- Verify the side effect alongside what is visible. After a status change, read
  `store.todos` with `page.evaluate` and assert the item's new status, then confirm the item
  also moved in the rendered view. Reading state is fine as proof. Writing it is not.
- Mock nothing. The app has no external boundary to isolate, so a mock here would only hide
  the thing under test. The one network request is the Google Fonts stylesheet, and the page
  still renders without it.
- Status transitions are governed by the status table in `domain.js`. A journey that
  asserts a move must also assert that an illegal move is refused, or it has only proved
  half the rule. Assert both the absent option in the editor's status select and
  `store.canMove(id, to) === false`.
- Persistence is only tested by a reload. An assertion made without one has tested the
  in-memory state and nothing else.

## Cleanup

```bash
.claude/skills/verify-todo-ui/helpers/cleanup.sh "$RUN_ID"
```

It kills the pid recorded in `.run/server.pid` and nothing else. It never matches on process
name, so it cannot take down a server another run or the user started. It removes only
`.run/`, so every artifact under `verification/$RUN_ID/` survives.

Run cleanup after a failed attempt too, so a broken journey does not strand a port.

## Helpers

All of these are executable and live in `helpers/`.

- `launch.sh <RUN_ID> [APP_DIR]` starts an isolated instance and waits for it to serve the app.
- `doctor.sh <RUN_ID>` is the read-only health check.
- `drive.mjs <RUN_ID> <journey.mjs>` runs a journey and writes evidence.
- `cleanup.sh <RUN_ID>` stops what this run started and keeps the artifacts.
- `ensure-chrome.sh` prints the Chromium path and its library directory, unpacking the
  missing libraries first if needed.

`helpers/node_modules` holds `playwright-core`. Reinstall with
`npm --prefix .claude/skills/verify-todo-ui/helpers install`.

## What this skill has not verified

The app has no build step, no backend, no auth, and no server-side data. `launch.sh` starts
a static file server and nothing else. If any of those arrive, extend it rather than
assuming it already covers them.

Storage failure paths are driven by writing into `localStorage` before a load. That proves
the app's handling. It does not prove the browser behaves the same way under a real quota
exhaustion or in a privacy mode this host cannot reproduce.

Read `features/README.md` before driving. It is the maintained list of what a user can do
and what proves each one works.
