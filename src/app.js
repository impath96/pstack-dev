// The shell. The only file that holds mutable state, reads the clock, touches the
// browser, or mounts DOM. It makes no decision about todos; it turns events into
// commands, hands them to reduce, persists, and redraws.
//
// Trace of every user action in the app:
//   click -> CONTROLS[name](id, state) -> dispatch(command) -> reduce -> storage.save
//         -> project -> renderApp

import { allowedTargets, byStatus, canMove, find, initialState, nextStatus, reduce } from './domain.js';
import { openStorage } from './storage.js';
import { project } from './view-model.js';
import { renderApp } from './views.js';

/** @typedef {import('./domain.js').Command} Command */
/** @typedef {import('./domain.js').State} State */
/** @typedef {import('./domain.js').Todo} Todo */
/** @typedef {import('./domain.js').TodoId} TodoId */

const root = /** @type {HTMLElement} */ (document.getElementById('app'));
const editor = /** @type {HTMLDialogElement} */ (document.getElementById('editor'));
const storage = openStorage(window);

/** @type {State} The single owner of application state. Nothing else holds a copy. */
let state = initialState();

/**
 * DOM control name -> the command it means. The one list of controls in the app; the
 * delegation selector below is derived from its keys, so a new control cannot be added
 * to only half of the pair.
 * @type {Record<string, (id: TodoId | null, state: State) => Command | null>}
 */
const CONTROLS = {
  create: () => ({ type: 'editor/open', target: null }),
  edit: (id) => ({ type: 'editor/open', target: id }),
  delete: (id) => ({ type: 'todo/delete', id }),
  advance: (id, current) => advanceCommand(current, id),
  undo: () => ({ type: 'todo/undo' }),
  cancel: () => ({ type: 'editor/cancel' }),
  dismiss: () => ({ type: 'notice/set', notice: null }),
};

const CONTROL_SELECTOR = Object.keys(CONTROLS).map((name) => `[data-${name}]`).join(',');

/**
 * Apply one command. The only mutation point in the app.
 *
 * Not re-entrant and does not need to be: a failed save folds its notice into the same
 * state before the single render, so one event produces one draw.
 *
 * @param {Command | null} command
 * @returns {void}
 */
function dispatch(command) {
  if (!command) return;
  const next = reduce(state, command);
  if (next === state) return;
  // Adopted todos came out of storage, so writing them back is redundant, and between
  // two tabs it would bounce a storage event back and forth forever.
  const persist = command.type !== 'store/adopt' && next.todos !== state.todos;
  const failure = persist ? storage.save(next.todos) : null;
  state = failure ? reduce(next, { type: 'notice/set', notice: failure }) : next;
  render();
}

function render() {
  renderApp(root, project(state, todayIso()));
}

/**
 * @param {State} current
 * @param {TodoId | null} id
 * @returns {Command | null} null when the todo is already at the terminal status
 */
function advanceCommand(current, id) {
  const todo = id === null ? undefined : find(current.todos, id);
  if (!todo) return null;
  const to = nextStatus(todo.status);
  return to && canMove(current.todos, todo.id, to) ? { type: 'todo/move', id: todo.id, to } : null;
}

/** @param {MouseEvent} event */
function onControlClick(event) {
  const element = /** @type {Element} */ (event.target).closest(CONTROL_SELECTOR);
  if (!element) return;
  const name = Object.keys(CONTROLS).find((key) => key in element.dataset);
  dispatch(CONTROLS[name](toId(element.dataset[name]), state));
}

/**
 * The dialog is uncontrolled: the DOM is the draft buffer and is read once, here. No
 * per-keystroke command, so typing never triggers a redraw and never loses focus.
 * @param {SubmitEvent} event
 */
function onEditorSubmit(event) {
  event.preventDefault();
  const form = /** @type {HTMLFormElement} */ (event.target);
  const fields = Object.fromEntries(
    [...form.querySelectorAll('[data-field]')].map((input) => [
      /** @type {HTMLElement} */ (input).dataset.field,
      /** @type {HTMLInputElement} */ (input).value,
    ])
  );
  dispatch({ type: 'editor/save', fields });
}

/** @param {string | undefined} value @returns {TodoId | null} */
function toId(value) {
  const id = Number(value);
  return value && Number.isInteger(id) ? id : null;
}

/** @returns {import('./domain.js').IsoDate} local calendar date, not UTC */
function todayIso() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  // toISOString() is UTC and would mark a todo overdue nine hours early in KST.
  return `${now.getFullYear()}-${month}-${day}`;
}

/** @param {Todo} todo @returns {Todo} */
function copyOf(todo) {
  return { ...todo, tags: [...todo.tags] };
}

/**
 * Read-only state for the verification harness. Frozen, with no `move`, no `dispatch`
 * and no setter, so "reading state is proof, writing it is not" is enforced rather than
 * requested. `todos` hands out copies, so a journey cannot mutate live state.
 *
 * The two predicates matter for the transition rule. The UI only ever offers legal moves,
 * so the refused half of the rule has no clickable path; a journey proves it by asserting
 * `canMove(12, 'todo') === false` alongside the disabled button.
 */
function publishReadSeam() {
  Object.defineProperty(window, 'store', {
    value: Object.freeze({
      get todos() {
        return state.todos.map(copyOf);
      },
      byStatus: (status) => byStatus(state.todos, status).map(copyOf),
      canMove: (id, to) => canMove(state.todos, id, to),
      allowedTargets: (id) => allowedTargets(state.todos, id),
      version: 1,
    }),
  });
}

function main() {
  state = reduce(state, { type: 'store/adopt', ...storage.load() });
  root.addEventListener('click', onControlClick);
  root.addEventListener('submit', onEditorSubmit);
  // Escape closes a <dialog> without telling us, which would leave ui.editor open.
  editor.addEventListener('close', () => dispatch({ type: 'editor/cancel' }));
  storage.subscribe((loaded) => dispatch({ type: 'store/adopt', ...loaded }));
  publishReadSeam();
  render();
  document.body.dataset.ready = 'true';
}

main();
