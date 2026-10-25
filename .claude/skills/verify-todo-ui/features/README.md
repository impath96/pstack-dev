# Todo UI verification map

This directory is the maintained source for verifying the user-facing behavior of the todo
app. Read this index before driving the app, then use the matching feature file as the
recipe. A proof that drives one convenient entry point is incomplete when the file lists
others.

## Baseline preconditions

- Launch one instance with `helpers/launch.sh "$RUN_ID" src`. It picks a free port, so
  concurrent runs do not share state. A new port is a new origin, which is also what gives
  each run its own empty localStorage.
- Never drive an instance this run did not start. `helpers/doctor.sh "$RUN_ID"` must print
  `DOCTOR OK`, which includes confirming the recorded port serves this app.
- The app persists to localStorage. A reload is NOT a reset. Within one run, reset by
  loading `?reset=seed`, which clears stored data and reloads the seed.
- On a first visit with empty storage the app seeds 12 todos with ids 1 through 12, six in
  `todo`, three in `doing`, three in `done`.
- Item 2 (`결제 실패 로그 수집`) is `todo`, high priority, and past due. Item 12
  (`웹훅 재시도 백오프`) is `done`. Journeys that need a movable item or a terminal item use
  these.
- Wait for `body[data-ready="true"]` before asserting anything. It is set after the first
  render.
- The page loads Noto Sans KR from Google Fonts. No CJK font is installed on this host, so
  without network access every Korean glyph renders as a box. Screenshots taken offline are
  not valid visual proof.

## Driving conventions

- Start every journey from a known storage state. Either a fresh `RUN_ID`, or
  `?reset=seed` on the current one.
- Select by stable handle: `#view`, `.group[data-status]`, `.row[data-id]`,
  `[data-advance]`, `[data-edit]`, `[data-delete]`, `[data-create]`, `[data-undo]`,
  `[data-field="<name>"]`, `[data-submit]`, `[data-cancel]`, `#notice[data-notice]`.
- Never select by position. Items sort by priority, then due date, then id, so `first()` is
  not a stable item and is often a `done` item whose control is correctly disabled.
- Read state with `page.evaluate(() => store.todos)`. The `store` global is frozen and has
  no write method, so there is no way to write state around the UI, by design.
- Treat every selector and command here as literal.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a screenshot plus either an ARIA snapshot or the read-back `store` state.
- Mutation proof names the item id, its value before, and its value after.
- Persistence proof reloads the page and asserts the change survived. An assertion made
  without a reload has not tested persistence.
- A rule proof covers both halves. The allowed move succeeds, and the forbidden move is
  refused. With no kanban board there is no illegal click to attempt, so the refused half
  is proved by reading `store.canMove(id, to)`.
- Report an unreachable path with the attempted command and the unmet precondition. Never
  weaken a journey to make it pass, and never report a skipped entry point as verified
  through a different one.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph of user-visible behavior, then
uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`,
`Driving it with drive.mjs`, `Gotchas`.

## Features

- [Advance a todo's status](./status-advance.md) covers the row button, the editor's status select, the terminal state, and the refused move.
- [Create, edit and delete a todo](./crud.md) covers the editor dialog, validation, delete, and undo.
- [Keep data across reloads](./persistence.md) covers the seed, persistence, reset, and every storage failure mode.
- [Use the app on a phone](./responsive.md) covers the list at 414px.
