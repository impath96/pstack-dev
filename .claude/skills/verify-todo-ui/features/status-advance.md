# Advance a todo's status

Each row carries one button that moves the todo to the next status the transition table
allows. A todo in `완료` has no next status, so its button is disabled and reads the
terminal label. The editor's status select offers every status the table allows from the
current one, which is how a todo moves backward now that the kanban board is gone. Both
controls ask the same table.

## Sub-features

- `advance-row` moves a todo forward from the row button.
- `advance-terminal` offers no forward move for a todo already in `완료`.
- `advance-editor` moves a todo in either direction through the editor's status select.
- `advance-refused` never offers an illegal target, and `store.canMove` refuses one.
- `advance-regroup` moves the row under the destination group header.

## How to get to it (user POV)

- Choose the status button at the right end of a row.
- Open a todo with its title or edit control, then choose a different status in the editor
  and save.

## Driving it with drive.mjs

Preconditions:

- `helpers/doctor.sh "$RUN_ID"` prints `DOCTOR OK`.
- Storage holds the seed. Load `?reset=seed` if an earlier journey changed it.
- `body[data-ready="true"]` is present.

- **Record the starting status.** Run
  `const before = await page.evaluate(() => Object.fromEntries(store.todos.map((t) => [t.id, t.status])))`.
  Item 2 reads `todo`.
- **Advance from the row.** Choose the status button on item 2. Run
  `await page.click('[data-advance="2"]')`. Item 2 reads `doing` in the store, and
  `.row[data-id="2"]` carries `data-status="doing"`.
- **Confirm it re-grouped.** Compare the index of item 2 among
  `#view .group, #view .row` before and after. It moves below the `진행 중` header. The
  group headers carry `data-status` and never `data-id`, so matching on `dataset.id` finds
  rows only.
- **Terminal state.** Run `await page.locator('[data-advance="12"]').isDisabled()`. It is
  `true`, and the button's text is the terminal label.
- **Move backward through the editor.** Open item 2, choose `할 일` in the status select,
  and save. Run `await page.click('[data-edit="2"]')`, then select on
  `[data-field="status"]`, then `await page.click('[data-submit]')`. Item 2 reads `todo`
  again.
- **The UI never offers an illegal target.** With item 2 in `todo`, open its editor and
  read the status options. Run
  `await page.locator('[data-field="status"] option').allTextContents()`. `완료` is absent,
  because the table does not allow `todo` to `done`.
- **Prove the refused half.** Run `await page.evaluate(() => store.canMove(2, 'done'))`.
  It is `false`. Reading state is proof. There is no illegal click to attempt, because the
  UI cannot render one.
- **Proof.** Screenshot before and after one move and record both statuses. Run
  `await ev.shot('advance-before')`, the click, `await ev.shot('advance-after')`, and
  `ev.json('advance', { id: 2, before: before[2], after: after[2], refused: { to: 'done', canMove: false } })`.
  A proof that shows only the successful move has verified half the rule.

## Gotchas

- Items sort by priority, then due date, then id, so the first row on screen is usually a
  `done` item whose button is correctly disabled. A journey that clicks `.row` `.first()`
  times out waiting for an enabled element. Pick the item by id.
- The whole list re-renders after a move, so a locator captured before the click points at
  a detached node. Re-query after every mutation.
- A status change persists. The next journey in the same run starts from the changed state
  unless it loads `?reset=seed` first.
- The editor is a `<dialog>` outside `#view`. A list re-render does not rebuild it, so do
  not wait for it to disappear and come back after an unrelated change.
