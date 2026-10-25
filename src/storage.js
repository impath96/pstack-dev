// The app's only contact with localStorage. Everything about persistence that can go
// wrong is decided here and leaves as a Notice tag. No Hangul, no DOM, and no console
// output: the verification harness fails a run on any console error, and a browser with
// storage disabled is a supported configuration, not a bug.

import { SEED, parseStored } from './domain.js';

/** @typedef {import('./domain.js').Todo} Todo */

/**
 * What the shell is told about persistence. A tag, not a sentence; strings.js owns the
 * Korean and views.js renders it.
 * @typedef {{ kind: 'memory' }      no storage in this browser, running in memory
 *         | { kind: 'quota' }       the last write did not land
 *         | { kind: 'corrupt' }     the stored value was unreadable and has been quarantined
 *         | { kind: 'dropped', count: number }  that many records failed parseStored
 *         | { kind: 'newer' }       a newer build wrote the stored value; it is left alone
 *         | { kind: 'adopted' }     another tab wrote and this tab took its snapshot
 *         } Notice
 */

/** @typedef {{ todos: Todo[], notice: Notice | null }} LoadResult */

/**
 * @typedef {object} Store
 * @property {() => LoadResult} load
 * @property {(todos: Todo[]) => Notice | null} save null means persisted
 * @property {(onChange: (loaded: LoadResult) => void) => void} subscribe another tab wrote
 */

const KEY = 'todo.v1';
const QUARANTINE_PREFIX = 'todo.corrupt.';

/**
 * Bumped when the on-disk shape changes. The stored envelope carries the version it was
 * written with, and MIGRATIONS walks it forward one step at a time.
 */
const VERSION = 1;

/** @typedef {{ version: number, todos: unknown[] }} Envelope */

/**
 * version -> how to get from that version to the next one. The chain is walked, not
 * branched on, so adding v2 means adding one entry and nothing else.
 * @type {Record<number, (envelope: Envelope) => Envelope>}
 */
const MIGRATIONS = {
  // v0 is a bare array, what a first release writes with no envelope around it.
  0: (envelope) => ({ version: 1, todos: envelope.todos }),
};

/**
 * Open the app's persistence. Probes the browser once; from here on the returned Store
 * behaves the same whether or not storage actually exists.
 *
 * @param {Window} win the environment boundary, passed in so this module reads no global
 * @returns {Store}
 */
export function openStorage(win) {
  const backend = probe(win);

  // An explicit ?reset=seed outranks everything below, including the newer-version
  // protection: the operator asked for a wipe before the app ever read the value.
  if (backend && new URLSearchParams(win.location.search).get('reset') === 'seed') {
    try {
      backend.removeItem(KEY);
    } catch {
      // A browser that refuses the remove still gets a correct in-memory list.
    }
  }

  // Set by a load that found data from a newer build. While it is on, this tab is a
  // reader: it keeps working in memory and never writes over data it cannot represent.
  let readOnly = false;

  /** @returns {LoadResult} */
  function load() {
    const result = read(backend);
    readOnly = result.readOnly;
    return { todos: result.todos, notice: result.notice };
  }

  return Object.freeze({
    load,

    /** @param {Todo[]} todos */
    save(todos) {
      if (!backend) return { kind: 'memory' };
      if (readOnly) return { kind: 'newer' };
      try {
        // One whole-envelope write, so a reader can never observe a half-written list.
        backend.setItem(KEY, JSON.stringify({ version: VERSION, todos }));
        return null;
      } catch {
        // The in-memory state is NOT rolled back. The edit really happened, it just is
        // not durable, and undoing it in front of the user would be worse than saying so.
        return { kind: 'quota' };
      }
    },

    /** @param {(loaded: LoadResult) => void} onChange */
    subscribe(onChange) {
      // The event fires only in OTHER tabs, so this is how a second tab stops showing a
      // stale list. Both tabs write the whole snapshot, so the losing write is the older
      // one and the tabs converge. A null key means the whole area was cleared.
      win.addEventListener('storage', (event) => {
        if (event.key !== null && event.key !== KEY) return;
        const result = read(backend);
        readOnly = result.readOnly;
        onChange({ todos: result.todos, notice: result.notice ?? { kind: 'adopted' } });
      });
    },
  });
}

/**
 * Safari in private mode throws on setItem, and an embedded context can throw on merely
 * touching window.localStorage, so the probe is a real round trip inside try/catch.
 * @param {Window} win
 * @returns {globalThis.Storage | null}
 */
function probe(win) {
  try {
    const backend = win.localStorage;
    backend.setItem(`${KEY}.probe`, '1');
    backend.removeItem(`${KEY}.probe`);
    return backend;
  } catch {
    return null;
  }
}

/**
 * @param {globalThis.Storage | null} backend
 * @returns {{ todos: Todo[], notice: Notice | null, readOnly: boolean }}
 */
function read(backend) {
  if (!backend) return { todos: seed(), notice: { kind: 'memory' }, readOnly: false };

  let raw = null;
  try {
    raw = backend.getItem(KEY);
  } catch {
    return { todos: seed(), notice: { kind: 'memory' }, readOnly: false };
  }
  if (raw === null) return { todos: seed(), notice: null, readOnly: false };

  const envelope = readEnvelope(raw);
  if (envelope.tag === 'newer') {
    // Start empty rather than from the seed: an empty list says "this tab is not showing
    // your data" where twelve familiar rows would claim the opposite.
    return { todos: [], notice: { kind: 'newer' }, readOnly: true };
  }
  if (envelope.tag === 'corrupt') {
    quarantine(backend, raw);
    return { todos: seed(), notice: { kind: 'corrupt' }, readOnly: false };
  }

  const migrated = migrate(envelope);
  if (!migrated) {
    quarantine(backend, raw);
    return { todos: seed(), notice: { kind: 'corrupt' }, readOnly: false };
  }

  /** @type {Todo[]} */
  const todos = [];
  const seen = new Set();
  let dropped = 0;
  for (const record of migrated.todos) {
    const todo = parseStored(record);
    // Dropping bad records beats refusing the whole file: one broken row must not cost
    // the user the other eleven. A repeated id is dropped too, since find() and the
    // upsert would otherwise disagree about which todo an id means.
    if (!todo || seen.has(todo.id)) {
      dropped += 1;
      continue;
    }
    seen.add(todo.id);
    todos.push(todo);
  }

  // A load never writes. The migrated shape is persisted by the next save, which is the
  // next thing the user does. Writing on load would turn a page visit into a storage
  // write and could hit quota before the user did anything.
  return { todos, notice: dropped > 0 ? { kind: 'dropped', count: dropped } : null, readOnly: false };
}

/**
 * The version is read before anything else is judged, so a shape this build does not
 * understand is never mistaken for corruption and quarantined away.
 * @param {string} raw
 * @returns {{ tag: 'ok', version: number, todos: unknown[] } | { tag: 'newer' } | { tag: 'corrupt' }}
 */
function readEnvelope(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return { tag: 'corrupt' };
  }
  if (Array.isArray(value)) return { tag: 'ok', version: 0, todos: value };
  if (value === null || typeof value !== 'object') return { tag: 'corrupt' };
  if (!Number.isInteger(value.version) || value.version < 0) return { tag: 'corrupt' };
  if (value.version > VERSION) return { tag: 'newer' };
  if (!Array.isArray(value.todos)) return { tag: 'corrupt' };
  return { tag: 'ok', version: value.version, todos: value.todos };
}

/**
 * @param {{ version: number, todos: unknown[] }} envelope
 * @returns {Envelope | null} null when a step is missing or throws
 */
function migrate(envelope) {
  let current = envelope;
  while (current.version < VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) return null;
    try {
      current = step(current);
    } catch {
      return null;
    }
  }
  return current;
}

/**
 * Best effort. Keeping the bad value means a support question can be answered later;
 * silently overwriting a user's data because our parser had a bug cannot be undone.
 * @param {globalThis.Storage} backend
 * @param {string} raw
 */
function quarantine(backend, raw) {
  try {
    backend.setItem(QUARANTINE_PREFIX + Date.now(), raw);
  } catch {
    // No room for the copy. Removing the key below still lets the app start.
  }
  try {
    backend.removeItem(KEY);
  } catch {
    // Nothing else to try. The next load quarantines again and still seeds.
  }
}

/** @returns {Todo[]} a fresh copy, so the seed constant can never be mutated */
function seed() {
  return SEED.map((todo) => ({ ...todo, tags: [...todo.tags] }));
}
