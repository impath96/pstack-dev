// Every rule about what a todo is and what may happen to it. One status table, one
// priority table, one reducer. No DOM, no storage, no clock, no globals, and no imports:
// this file is the bottom of the module graph, so no presentation policy can reach it.

/** @typedef {number} TodoId */
/** @typedef {keyof typeof STATUSES} StatusId */
/** @typedef {keyof typeof PRIORITIES} PriorityId */
/** @typedef {string} IsoDate `YYYY-MM-DD`. Compared as a string; the format sorts. */

/**
 * A todo after parsing. Every field is already validated, so nothing past this file's
 * parse boundary re-checks it.
 * @typedef {object} Todo
 * @property {TodoId} id
 * @property {string} title non-empty, trimmed
 * @property {StatusId} status
 * @property {PriorityId} priority
 * @property {IsoDate | null} due null means no deadline, which is a normal todo
 * @property {string[]} tags lowercase, trimmed, deduped, no leading '#'
 * @property {string} assignee non-empty, trimmed
 */

/**
 * The workflow. Key order is status order, `moves` is the whole transition rule, and
 * `closed` is what "this todo is finished" means. Everything else is derived from here:
 * group order, the advance target, strike-through, overdue. Adding a status is one row
 * here plus one label in strings.js, and strings.js fails the load if you forget.
 * @type {Record<string, { accent: string, closed: boolean, moves: string[] }>}
 */
export const STATUSES = {
  todo: { accent: '#64748b', closed: false, moves: ['doing'] },
  doing: { accent: '#2563eb', closed: false, moves: ['todo', 'done'] },
  done: { accent: '#16a34a', closed: true, moves: ['doing'] },
};

/** @type {Record<string, { accent: string }>} Key order is urgency order. */
export const PRIORITIES = {
  high: { accent: '#dc2626' },
  mid: { accent: '#d97706' },
  low: { accent: '#0891b2' },
};

/** @type {StatusId[]} */
export const STATUS_ORDER = /** @type {StatusId[]} */ (Object.keys(STATUSES));

/** @type {PriorityId[]} */
export const PRIORITY_ORDER = /** @type {PriorityId[]} */ (Object.keys(PRIORITIES));

/** @type {StatusId} */
const INITIAL_STATUS = STATUS_ORDER[0];

/** @type {PriorityId} */
const DEFAULT_PRIORITY = /** @type {PriorityId} */ ('mid');

const TITLE_MAX = 120;

for (const [from, row] of Object.entries(STATUSES)) {
  for (const to of row.moves) {
    if (!(to in STATUSES)) throw new Error(`STATUSES.${from}.moves names an unknown status: ${to}`);
    if (to === from) throw new Error(`STATUSES.${from}.moves lists itself`);
  }
}
if (!(DEFAULT_PRIORITY in PRIORITIES)) throw new Error(`DEFAULT_PRIORITY is not a priority: ${DEFAULT_PRIORITY}`);

/** @type {Todo[]} Shipped starting data. The verification skill pins ids 1 through 12. */
export const SEED = [
  { id: 1, title: '로그인 화면 리디자인', status: 'doing', priority: 'high', due: '2026-10-26', tags: ['design', 'auth'], assignee: '지연' },
  { id: 2, title: '결제 실패 로그 수집', status: 'todo', priority: 'high', due: '2026-10-24', tags: ['billing'], assignee: '민호' },
  { id: 3, title: '온보딩 카피 다듬기', status: 'todo', priority: 'low', due: '2026-11-04', tags: ['copy'], assignee: '지연' },
  { id: 4, title: '알림 설정 API 연동', status: 'doing', priority: 'mid', due: '2026-10-28', tags: ['api', 'notify'], assignee: '수빈' },
  { id: 5, title: '검색 인덱스 재구축 스크립트', status: 'todo', priority: 'mid', due: '2026-10-30', tags: ['infra'], assignee: '민호' },
  { id: 6, title: '다크 모드 토큰 정리', status: 'done', priority: 'low', due: '2026-10-20', tags: ['design'], assignee: '수빈' },
  { id: 7, title: '회원 탈퇴 플로우 QA', status: 'todo', priority: 'high', due: '2026-10-27', tags: ['qa', 'auth'], assignee: '지연' },
  { id: 8, title: '이미지 업로드 용량 제한', status: 'done', priority: 'mid', due: '2026-10-18', tags: ['api'], assignee: '민호' },
  { id: 9, title: '주간 리포트 메일 템플릿', status: 'doing', priority: 'low', due: '2026-11-02', tags: ['growth'], assignee: '수빈' },
  { id: 10, title: '세션 만료 안내 토스트', status: 'todo', priority: 'mid', due: '2026-10-29', tags: ['auth'], assignee: '수빈' },
  { id: 11, title: '모바일 하단 탭 정렬', status: 'todo', priority: 'low', due: '2026-11-06', tags: ['design'], assignee: '지연' },
  { id: 12, title: '웹훅 재시도 백오프', status: 'done', priority: 'high', due: '2026-10-15', tags: ['infra', 'api'], assignee: '민호' },
];

// --- Pure queries -----------------------------------------------------------------

/**
 * The first legal move that goes later in status order, or null at the end of the
 * workflow. The only definition of "forward"; the row button and the reducer share it.
 * @param {StatusId} from
 * @returns {StatusId | null}
 */
export function nextStatus(from) {
  const row = STATUSES[from];
  if (!row) return null;
  const rank = STATUS_ORDER.indexOf(from);
  return row.moves.find((to) => STATUS_ORDER.indexOf(to) > rank) ?? null;
}

/**
 * @param {Todo[]} todos
 * @param {TodoId} id
 * @returns {Todo | undefined}
 */
export function find(todos, id) {
  return todos.find((todo) => todo.id === id);
}

/**
 * @param {Todo[]} todos
 * @param {StatusId} status
 * @returns {Todo[]} in urgency order, so a caller never re-sorts
 */
export function byStatus(todos, status) {
  return todos.filter((todo) => todo.status === status).sort(compareUrgency);
}

/**
 * @param {Todo[]} todos
 * @param {TodoId} id
 * @param {StatusId} to
 * @returns {boolean} false for an unknown id, an unknown status, or a move the table forbids
 */
export function canMove(todos, id, to) {
  const todo = find(todos, id);
  if (!todo || typeof to !== 'string' || !(to in STATUSES)) return false;
  return STATUSES[todo.status].moves.includes(to);
}

/**
 * Every status this todo may move to right now, excluding its current one, in status
 * order. The editor's status select is built from this, which is why the UI can never
 * offer an illegal move.
 * @param {Todo[]} todos
 * @param {TodoId} id
 * @returns {StatusId[]}
 */
export function allowedTargets(todos, id) {
  const todo = find(todos, id);
  if (!todo) return [];
  return STATUS_ORDER.filter((to) => STATUSES[todo.status].moves.includes(to));
}

/**
 * Priority, then due date, then id. The id tiebreak is load-bearing: without it two todos
 * with equal priority and due date swap places whenever an unrelated edit rewrites the
 * array, and a journey that tracks row order sees phantom movement.
 * @param {Todo} a
 * @param {Todo} b
 * @returns {number}
 */
function compareUrgency(a, b) {
  return (
    PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) ||
    compareDue(a.due, b.due) ||
    a.id - b.id
  );
}

/**
 * A todo with no due date sorts after every todo that has one.
 * @param {IsoDate | null} a
 * @param {IsoDate | null} b
 * @returns {number}
 */
function compareDue(a, b) {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * @param {Todo} todo
 * @param {IsoDate} today supplied by the shell; the domain owns no clock
 * @returns {boolean} never true without a due date, and never true once closed
 */
export function isOverdue(todo, today) {
  return todo.due !== null && !STATUSES[todo.status].closed && todo.due < today;
}

/**
 * @param {Todo[]} todos
 * @returns {TodoId} one above the highest existing id, so it is free even after deletes
 */
function mintId(todos) {
  return todos.reduce((max, todo) => Math.max(max, todo.id), 0) + 1;
}

// --- Parsing (the form and storage boundary) ---------------------------------------

/**
 * Raw strings straight out of the editor's inputs. Nothing trusts these.
 * @typedef {Record<string, string>} RawFields
 */

/**
 * @typedef {{ ok: true, todo: Todo } | { ok: false, errors: Record<string, string> }} ParseResult
 */

/**
 * Parse editor input into a Todo. The only way a Todo is built from user input: validate
 * once here, trust the type everywhere after.
 * @param {TodoId} id minted when the editor opened
 * @param {RawFields} fields
 * @returns {ParseResult}
 */
function parseFields(id, fields) {
  /** @type {Record<string, string>} */
  const errors = {};

  const title = text(fields.title);
  if (title === '') errors.title = 'required';
  else if (title.length > TITLE_MAX) errors.title = 'tooLong';

  const assignee = text(fields.assignee);
  if (assignee === '') errors.assignee = 'required';

  const status = text(fields.status);
  if (!(status in STATUSES)) errors.status = 'badChoice';

  const priority = text(fields.priority);
  if (!(priority in PRIORITIES)) errors.priority = 'badChoice';

  const rawDue = text(fields.due);
  const due = rawDue === '' ? null : parseIsoDate(rawDue);
  if (rawDue !== '' && due === null) errors.due = 'badDate';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    todo: {
      id,
      title,
      status: /** @type {StatusId} */ (status),
      priority: /** @type {PriorityId} */ (priority),
      due,
      tags: parseTags(text(fields.tags).split(',')),
      assignee,
    },
  };
}

/**
 * Parse one record read back from storage. Same target type as parseFields, different
 * input shape, so storage.js never builds a Todo by hand.
 * @param {unknown} raw
 * @returns {Todo | null} null for a record this version cannot represent
 */
export function parseStored(raw) {
  if (raw === null || typeof raw !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (raw);

  if (!Number.isInteger(record.id)) return null;
  if (typeof record.title !== 'string' || record.title.trim() === '') return null;
  if (typeof record.assignee !== 'string' || record.assignee.trim() === '') return null;
  if (typeof record.status !== 'string' || !(record.status in STATUSES)) return null;
  if (typeof record.priority !== 'string' || !(record.priority in PRIORITIES)) return null;

  let due = null;
  if (record.due !== null && record.due !== undefined) {
    if (typeof record.due !== 'string') return null;
    due = parseIsoDate(record.due.trim());
    if (due === null) return null;
  }

  let tags = [];
  if (record.tags !== null && record.tags !== undefined) {
    if (!Array.isArray(record.tags)) return null;
    tags = parseTags(record.tags.filter((tag) => typeof tag === 'string'));
  }

  return {
    id: /** @type {TodoId} */ (record.id),
    title: record.title.trim(),
    status: /** @type {StatusId} */ (record.status),
    priority: /** @type {PriorityId} */ (record.priority),
    due,
    tags,
    assignee: record.assignee.trim(),
  };
}

/** @param {unknown} value @returns {string} */
function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * @param {string} value
 * @returns {IsoDate | null} null unless the value is a real calendar date in ISO form
 */
function parseIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // A round trip rejects 2026-02-31, which the regex accepts and Date rolls forward.
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? value : null;
}

/** @param {string[]} parts @returns {string[]} */
function parseTags(parts) {
  const tags = parts.map((part) => part.trim().replace(/^#+/, '').toLowerCase()).filter((tag) => tag !== '');
  return [...new Set(tags)];
}

// --- State and commands ------------------------------------------------------------

/**
 * @typedef {object} Draft
 * @property {TodoId} id minted at open time, which is what makes a save idempotent
 * @property {'create'|'edit'} mode
 * @property {RawFields} fields what the dialog's inputs are seeded with
 * @property {Record<string, string> | null} errors field name -> FIELD_ERROR key
 */

/**
 * @typedef {{ todo: Todo, at: number }} Undo the deleted todo and where it sat
 */

/**
 * @typedef {object} Ui
 * @property {Draft | null} editor
 * @property {import('./storage.js').Notice | null} notice
 * @property {Undo | null} undo
 */

/**
 * The whole application state. One object, one owner (the shell's `state` binding).
 * @typedef {object} State
 * @property {Todo[]} todos insertion order, never presentation order
 * @property {Ui} ui
 */

/**
 * @typedef {{ type: 'store/adopt', todos: Todo[], notice: import('./storage.js').Notice | null }
 *         | { type: 'todo/move', id: TodoId, to: StatusId }
 *         | { type: 'todo/delete', id: TodoId }
 *         | { type: 'todo/undo' }
 *         | { type: 'editor/open', target: TodoId | null }
 *         | { type: 'editor/save', fields: RawFields }
 *         | { type: 'editor/cancel' }
 *         | { type: 'notice/set', notice: import('./storage.js').Notice | null }} Command
 */

/** @returns {State} empty, pre-load. `store/adopt` fills it. */
export function initialState() {
  return { todos: [], ui: { editor: null, notice: null, undo: null } };
}

/**
 * The single mutation path of the application. Total and pure: it never throws, never
 * touches the DOM or storage, and never logs.
 *
 * Two invariants the shell depends on:
 *   1. A command that changes nothing returns the IDENTICAL state object. That identity
 *      check is how `dispatch` skips a write and a re-render, and it is what makes every
 *      command safe to send twice.
 *   2. `next.todos === state.todos` exactly when no todo changed, so the shell knows
 *      whether to persist without diffing.
 *
 * @param {State} state
 * @param {Command} command
 * @returns {State}
 */
export function reduce(state, command) {
  switch (command.type) {
    case 'store/adopt': {
      const notice = sameNotice(state.ui.notice, command.notice) ? state.ui.notice : command.notice;
      return { todos: command.todos, ui: { ...state.ui, notice, undo: null } };
    }

    case 'todo/move': {
      // canMove is false both for an illegal target and for a todo already there, so a
      // replayed move converges instead of erroring.
      if (!canMove(state.todos, command.id, command.to)) return state;
      const todos = state.todos.map((todo) =>
        todo.id === command.id ? { ...todo, status: command.to } : todo
      );
      return { todos, ui: withoutUndo(state.ui) };
    }

    case 'todo/delete': {
      const at = state.todos.findIndex((todo) => todo.id === command.id);
      if (at === -1) return state;
      const editor = state.ui.editor && state.ui.editor.id === command.id ? null : state.ui.editor;
      return {
        todos: state.todos.filter((todo) => todo.id !== command.id),
        ui: { ...state.ui, editor, undo: { todo: state.todos[at], at } },
      };
    }

    case 'todo/undo': {
      const undo = state.ui.undo;
      if (!undo) return state;
      const todos = [...state.todos];
      todos.splice(Math.min(undo.at, todos.length), 0, undo.todo);
      return { todos, ui: { ...state.ui, undo: null } };
    }

    case 'editor/open': {
      const open = state.ui.editor;
      if (command.target === null) {
        // Opening twice without saving keeps the first draft, so a double click on the
        // create button does not wipe what the user typed.
        if (open && open.mode === 'create') return state;
        const draft = { id: mintId(state.todos), mode: 'create', fields: blankFields(), errors: null };
        return { todos: state.todos, ui: { ...state.ui, editor: draft } };
      }
      const todo = find(state.todos, command.target);
      if (!todo) return state;
      if (open && open.mode === 'edit' && open.id === todo.id) return state;
      const draft = { id: todo.id, mode: 'edit', fields: fieldsOf(todo), errors: null };
      return { todos: state.todos, ui: { ...state.ui, editor: draft } };
    }

    case 'editor/save': {
      const editor = state.ui.editor;
      if (!editor) return state;
      const result = parseFields(editor.id, command.fields);
      if (!result.ok) return withDraft(state, { ...editor, fields: command.fields, errors: result.errors });

      const todo = result.todo;
      const existing = find(state.todos, todo.id);
      if (existing && todo.status !== existing.status && !canMove(state.todos, todo.id, todo.status)) {
        return withDraft(state, { ...editor, fields: command.fields, errors: { status: 'badChoice' } });
      }
      // Upsert by the id minted at open time. This is what makes a double submit create
      // one todo instead of two.
      const todos = existing
        ? state.todos.map((each) => (each.id === todo.id ? todo : each))
        : [...state.todos, todo];
      return { todos, ui: { ...state.ui, editor: null, undo: null } };
    }

    case 'editor/cancel':
      if (!state.ui.editor) return state;
      return { todos: state.todos, ui: { ...state.ui, editor: null } };

    case 'notice/set':
      if (sameNotice(state.ui.notice, command.notice)) return state;
      return { todos: state.todos, ui: { ...state.ui, notice: command.notice } };

    default:
      return state;
  }
}

/** @param {State} state @param {Draft} editor @returns {State} */
function withDraft(state, editor) {
  return { todos: state.todos, ui: { ...state.ui, editor } };
}

/**
 * Undo survives only until the next change to the list. Anything else would let a
 * restore re-insert an id that a todo created in the meantime already took.
 * @param {Ui} ui
 * @returns {Ui}
 */
function withoutUndo(ui) {
  return ui.undo === null ? ui : { ...ui, undo: null };
}

/**
 * @param {import('./storage.js').Notice | null} a
 * @param {import('./storage.js').Notice | null} b
 * @returns {boolean} compared by value, so re-reporting one notice is a no-op
 */
function sameNotice(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.count === b.count;
}

/** @returns {RawFields} */
function blankFields() {
  return { title: '', status: INITIAL_STATUS, priority: DEFAULT_PRIORITY, due: '', tags: '', assignee: '' };
}

/** @param {Todo} todo @returns {RawFields} */
function fieldsOf(todo) {
  return {
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    due: todo.due ?? '',
    tags: todo.tags.join(', '),
    assignee: todo.assignee,
  };
}
