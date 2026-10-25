// Covers features/status-advance.md.
// Run: helpers/drive.mjs "$RUN_ID" .claude/skills/verify-todo-ui/journeys/status-advance.mjs

export default async ({ page, app, ev, check }) => {
  await page.goto(`${app}/index.html?reset=seed`, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="true"]');

  const statuses = () =>
    page.evaluate(() => Object.fromEntries(store.todos.map((t) => [t.id, t.status])));
  const indexOf = (id) =>
    page.evaluate(
      (target) =>
        [...document.querySelectorAll('#view .group, #view .row')].findIndex((n) => n.dataset.id === target),
      id
    );

  const before = await statuses();
  check(before[2] === 'todo', 'seed puts item 2 in todo');
  check(before[12] === 'done', 'seed puts item 12 in done');
  check((await page.locator('#view .row').count()) === 12, 'the seeded list renders 12 rows');

  const groupsHaveNoId = await page.evaluate(() =>
    [...document.querySelectorAll('#view .group')].every((g) => g.dataset.id === undefined)
  );
  check(groupsHaveNoId, 'group headers carry no data-id, so row indexing is not shifted');

  await ev.shot('advance-before');
  const was = await indexOf('2');
  await page.click('[data-advance="2"]');
  const now = await indexOf('2');
  const after = await statuses();
  check(after[2] === 'doing', 'the row button moves item 2 from todo to doing');
  check(
    (await page.getAttribute('#view .row[data-id="2"]', 'data-status')) === 'doing',
    'the row reports its new status in data-status'
  );
  check(now > was, 'item 2 re-groups below the 진행 중 header');
  await ev.shot('advance-after');

  check(await page.locator('[data-advance="12"]').isDisabled(), 'the terminal todo offers no forward move');

  // Item 10 is still in todo, which is the status the table forbids moving straight to done.
  await page.click('[data-edit="10"]');
  const options = await page.locator('[data-field="status"] option').allTextContents();
  check(options.length > 0, 'the editor offers a status select');
  check(
    !(await page.evaluate(() => store.allowedTargets(10).includes('done'))),
    'the editor never offers todo straight to done'
  );
  check(
    (await page.evaluate(() => store.canMove(10, 'done'))) === false,
    'the table refuses todo straight to done, which is the refused half of the rule'
  );
  await page.click('[data-cancel]');

  // Item 2 is in doing, so both directions are legal and the editor offers both.
  check(
    (await page.evaluate(() => store.allowedTargets(2).sort().join(','))) === 'done,todo',
    'a doing todo may move either way'
  );

  await page.click('[data-advance="2"]');
  check((await statuses())[2] === 'done', 'doing advances to done');
  check(
    (await page.evaluate(() => store.canMove(2, 'doing'))) === true,
    'a done todo may move back to doing'
  );
  check(
    (await page.evaluate(() => store.canMove(2, 'todo'))) === false,
    'a done todo may not jump back to todo'
  );

  ev.json('status', { id: 2, before: before[2], after: (await statuses())[2], terminalDisabled: true });
};
