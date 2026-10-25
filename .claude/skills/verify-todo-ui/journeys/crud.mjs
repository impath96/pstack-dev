// Covers features/crud.md.
// Run: helpers/drive.mjs "$RUN_ID" .claude/skills/verify-todo-ui/journeys/crud.mjs

const TITLE = '검증용 할 일';

export default async ({ page, app, ev, check }) => {
  await page.goto(`${app}/index.html?reset=seed`, { waitUntil: 'load' });
  await page.waitForSelector('body[data-ready="true"]');

  const rows = () => page.locator('#view .row').count();
  const titled = (title) => page.evaluate((t) => store.todos.filter((x) => x.title === t).length, title);

  check((await rows()) === 12, 'the seeded list renders 12 rows');

  await page.click('[data-create]');
  check(await page.locator('#editor').isVisible(), 'the create control opens the editor');
  await ev.shot('editor-open');

  await page.click('[data-submit]');
  check(await page.locator('#editor').isVisible(), 'an empty title keeps the editor open');
  check((await rows()) === 12, 'an empty title adds no row');
  check(
    (await page.locator('#editor [data-field-error], #editor .error, #editor [data-error]').count()) > 0,
    'an empty title is reported on the form, not just silently refused'
  );

  await page.fill('[data-field="title"]', TITLE);
  await page.fill('[data-field="assignee"]', '지연');
  await page.click('[data-submit]');
  check(!(await page.locator('#editor').isVisible()), 'a valid draft closes the editor');
  check((await rows()) === 13, 'a valid draft adds exactly one row');
  check((await titled(TITLE)) === 1, 'the new todo carries the title that was typed');
  await ev.shot('after-create');

  await page.click('[data-create]');
  await page.fill('[data-field="title"]', '두 번 제출');
  await page.fill('[data-field="assignee"]', '민호');
  await page.evaluate(() => {
    const form = document.querySelector('#editor form');
    form.requestSubmit();
    form.requestSubmit();
  });
  check((await rows()) === 14, 'submitting the same draft twice adds one row, not two');

  const target = await page.evaluate((t) => store.todos.find((x) => x.title === t).id, TITLE);
  await page.click(`[data-edit="${target}"]`);
  await page.fill('[data-field="title"]', '수정된 제목');
  await page.click('[data-submit]');
  check((await rows()) === 14, 'an edit changes no row count');
  check((await titled('수정된 제목')) === 1, 'an edit changes the stored title');

  await page.click(`[data-delete="${target}"]`);
  check((await rows()) === 13, 'delete removes the row immediately');
  check((await page.locator(`#view .row[data-id="${target}"]`).count()) === 0, 'the deleted row is gone');
  await ev.shot('after-delete');

  await page.click('[data-undo]');
  check((await rows()) === 14, 'undo restores the deleted todo');
  check((await titled('수정된 제목')) === 1, 'undo restores it with the fields it had');

  ev.json('crud', { created: TITLE, counts: [12, 13, 14, 13, 14], doubleSubmitAdded: 1 });
};
