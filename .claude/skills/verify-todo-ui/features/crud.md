# Create, edit and delete a todo

A user adds a todo through a dialog, edits any field of an existing one through the same
dialog, and deletes one from its row. Delete takes effect immediately and offers an undo
rather than asking for confirmation first. Invalid input keeps the dialog open and marks
every bad field at once.

## Sub-features

- `crud-create` adds one todo from the dialog.
- `crud-validate` refuses an invalid draft and marks every bad field, not just the first.
- `crud-idempotent` creates one todo, not two, when the form is submitted twice.
- `crud-edit` changes the fields of an existing todo.
- `crud-delete` removes a todo.
- `crud-undo` restores the todo the last delete removed.

## How to get to it (user POV)

- Choose the new-todo control in the header.
- Choose a todo's title or its edit control to open it.
- Choose a todo's delete control, then the undo control if it was a mistake.

## Driving it with drive.mjs

Preconditions:

- `helpers/doctor.sh "$RUN_ID"` prints `DOCTOR OK`.
- Storage holds the seed, so the list has 12 rows.
- `body[data-ready="true"]` is present.

- **Open the editor.** Run `await page.click('[data-create]')`. The dialog is open and the
  title field has focus.
- **Refuse an empty title.** Submit with the title blank. Run
  `await page.click('[data-submit]')`. The dialog stays open, the row count is still 12,
  and the title field carries an error. Assert the error is rendered, not merely that
  nothing was added.
- **Mark every bad field at once.** Submit with a blank title and a malformed due date.
  Both fields carry an error in the same submit. A design that stops at the first error
  fails this.
- **Create a todo.** Fill title, priority, due and assignee, then submit. Run
  `await page.fill('[data-field="title"]', '검증용 할 일')`, the other fields, then
  `await page.click('[data-submit]')`. The dialog closes, the row count is 13, and
  `store.todos` holds exactly one todo with that title.
- **Prove a double submit is harmless.** Open the editor, fill it, and submit twice without
  reopening. The row count rises by one, not two. The id is minted when the dialog opens,
  so the second submit updates the same todo.
- **Edit an existing todo.** Open item 3 and change its title. Run
  `await page.click('[data-edit="3"]')`, fill the title, submit. The row for item 3 shows
  the new title and `store.todos` agrees. The row count does not change.
- **Delete.** Run `await page.click('[data-delete="3"]')`. The row for item 3 is gone, the
  count drops by one, and no confirmation dialog appeared. Assert
  `page.locator('.row[data-id="3"]').count() === 0`.
- **Undo.** Run `await page.click('[data-undo]')`. Item 3 is back with the fields it had
  before the delete, including its status.
- **Proof.** Screenshot the open editor and the list after each mutation. Run
  `await ev.shot('editor-open')`, `await ev.shot('after-create')`,
  `await ev.shot('after-delete')`, and
  `ev.json('crud', { created: {...}, edited: {...}, deleted: 3, restored: true, counts: [12, 13, 12, 13] })`.

## Gotchas

- There is no confirm dialog on delete, by design. A journey that registers a dialog
  handler and waits for one will wait forever.
- The id is minted when the dialog opens, not when it is submitted. Opening the editor and
  cancelling does not consume an id that a later assertion depends on, but it does mean two
  separate opens produce two different ids.
- Every mutation persists. A journey that creates a todo and does not reset leaves it there
  for the next journey in the same run.
- The editor lives outside `#view`, so `#view`'s re-render does not touch it. Do not assert
  on the dialog by looking inside `#view`.
- Deleting the todo that is currently open in the editor closes the editor in the same
  step. A journey that deletes while editing must not expect the dialog to stay open.
