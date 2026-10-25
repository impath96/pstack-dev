// Covers features/persistence.md.
// Run: helpers/drive.mjs "$RUN_ID" .claude/skills/verify-todo-ui/journeys/persistence.mjs

const KEY = 'todo.v1';

export default async ({ page, app, ev, check }) => {
  const open = async (query = '') => {
    await page.goto(`${app}/index.html${query}`, { waitUntil: 'load' });
    await page.waitForSelector('body[data-ready="true"]');
  };
  const rows = () => page.locator('#view .row').count();
  const statusOf = (id) => page.evaluate((n) => store.todos.find((t) => t.id === n).status, id);
  const stored = () => page.evaluate((k) => localStorage.getItem(k), KEY);
  const notice = () => page.locator('#notice').getAttribute('data-notice').catch(() => null);

  await open();
  await page.evaluate(() => localStorage.clear());
  await open();
  check((await rows()) === 12, 'a first visit with empty storage seeds 12 todos');
  check((await statusOf(2)) === 'todo', 'the seed puts item 2 in todo');

  await page.click('[data-advance="2"]');
  check((await statusOf(2)) === 'doing', 'the change lands in memory');
  await open();
  check((await statusOf(2)) === 'doing', 'the change survives a reload, which is the actual persistence test');

  await open('?reset=seed');
  check((await statusOf(2)) === 'todo', 'reset=seed returns to the seeded state');
  check((await rows()) === 12, 'reset=seed restores all 12 rows');

  await page.evaluate((k) => localStorage.setItem(k, '{not json'), KEY);
  await open();
  check((await rows()) > 0, 'the app still renders after an unreadable stored value');
  check((await notice()) === 'corrupt', 'the corrupt banner says what happened');
  const quarantined = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('todo.corrupt.')).length
  );
  check(quarantined > 0, 'the unreadable value is quarantined rather than silently dropped');
  await ev.shot('notice-corrupt');

  const future = JSON.stringify({ version: 99, todos: [{ id: 1, title: 'from a newer build' }] });
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: KEY, v: future });
  await open();
  check((await notice()) === 'newer', 'data from a newer build is reported, not adopted');
  check((await stored()) === future, 'data from a newer build is left byte-for-byte unchanged on load');
  await page.click('[data-create]').catch(() => {});
  await page.fill('[data-field="title"]', '읽기 전용 확인').catch(() => {});
  await page.fill('[data-field="assignee"]', '수빈').catch(() => {});
  await page.click('[data-submit]').catch(() => {});
  check((await stored()) === future, 'a later edit still does not overwrite the newer build data');
  await ev.shot('notice-newer');

  await page.evaluate((k) => {
    localStorage.clear();
    localStorage.removeItem(k);
  }, KEY);

  ev.json('persistence', { survivedReload: true, reset: 'seed', corruptQuarantined: true, newerPreserved: true });
};
