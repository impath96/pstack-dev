# Keep data across reloads

Todos live in localStorage, so a change survives a reload and a browser restart. A first
visit with empty storage seeds 12 todos. When storage is unavailable, full, or holds data
this build cannot read, the app still runs and says what happened in a banner instead of
failing. It never destroys data written by a newer build.

## Sub-features

- `persist-seed` seeds 12 todos on a first visit with empty storage.
- `persist-survives` keeps a change across a reload.
- `persist-reset` returns to the seed on demand.
- `persist-memory` runs without storage and says so.
- `persist-quota` keeps the edit on screen when a write does not land.
- `persist-corrupt` recovers from an unreadable stored value and quarantines it.
- `persist-newer` refuses to overwrite data written by a newer version.

## How to get to it (user POV)

- Use the app, close the tab, open it again.
- Open the app in a browser with site data blocked.

## Driving it with drive.mjs

Preconditions:

- `helpers/doctor.sh "$RUN_ID"` prints `DOCTOR OK`.
- Each case below starts from a known storage state. Set storage explicitly with
  `page.evaluate` and then reload, rather than assuming what an earlier journey left.

- **Seed on a first visit.** Clear storage and reload. Run
  `await page.evaluate(() => localStorage.clear())` then `await page.reload()`. The list
  has 12 rows and `store.todos` holds ids 1 through 12.
- **A change survives a reload.** Advance item 2, reload, and read it back. Run
  `await page.click('[data-advance="2"]')`, `await page.reload()`,
  `await page.evaluate(() => store.todos.find((t) => t.id === 2).status)`. It is `doing`.
  This is the assertion that actually tests persistence. One made without a reload does
  not.
- **Reset.** Load `?reset=seed` and read the list back. Item 2 is `todo` again and the
  count is 12.
- **No storage at all.** Open a context with storage blocked, or stub it. The app still
  renders 12 rows and `#notice` carries the memory-only kind. Changes work for the session.
- **A write that does not land.** Fill storage until a write fails, then make a change. The
  change stays on screen and in `store.todos`, and `#notice` carries the quota kind. The
  app must not silently roll the edit back in front of the user.
- **Unreadable stored value.** Write garbage and reload. Run
  `await page.evaluate(() => localStorage.setItem('todo.v1', '{not json'))` then
  `await page.reload()`. The app renders, `#notice` carries the corrupt kind, and the
  original bad string is still readable under a quarantine key. Assert the quarantine copy
  exists. Losing the user's data silently is the failure this guards.
- **Newer version.** Write an envelope with a version above the current one and reload. The
  app renders empty or seeded and runs memory-only, and the stored value is byte-for-byte
  unchanged afterwards. Assert the stored string before and after are equal. This is the
  one case where the app must refuse to write.
- **Proof.** For each case record the stored value before, the banner kind, and the state
  after. Run `ev.json('persistence', { case, storedBefore, notice, todoCount, storedAfter })`
  and screenshot at least the memory-only and corrupt banners.

## Gotchas

- A reload is not a reset. Three of these cases fail if a journey assumes it is.
- A new `RUN_ID` gets a new port, which is a new origin, so its localStorage starts empty.
  That is the cheapest way to get a clean slate between runs. Within one run, use
  `?reset=seed`.
- Filling the quota takes a large write and is slow. Budget for it, and clear what you
  wrote afterwards or the next case in the same run inherits a full store.
- The quarantine key is written best effort. If the browser is also out of quota the copy
  can fail while the app still starts. Assert the app renders first, then the copy.
- `store.todos` returns copies. Mutating what it hands back changes nothing, by design, so
  a journey cannot set up a case that way. Write to localStorage and reload instead.
