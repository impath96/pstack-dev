// The projection: domain state in, a view model out. The only module that knows both the
// domain tables and the Korean strings, which is what keeps domain.js free of labels and
// views.js free of domain rules.
//
// Every decision a renderer might otherwise make with an `if` (which group, what order,
// is it overdue, what does the button say, is it disabled) is resolved here. If views.js
// needs a domain `if`, this file is missing a field.

import {
  STATUSES, PRIORITIES, STATUS_ORDER, PRIORITY_ORDER, allowedTargets, byStatus, isOverdue, nextStatus,
} from './domain.js';
import { FIELD_ERROR, FIELD_LABEL, NOTICE, PRIORITY_LABEL, STATUS_LABEL, T, UI } from './strings.js';

/** @typedef {import('./domain.js').Draft} Draft */
/** @typedef {import('./domain.js').IsoDate} IsoDate */
/** @typedef {import('./domain.js').State} State */
/** @typedef {import('./domain.js').StatusId} StatusId */
/** @typedef {import('./domain.js').Todo} Todo */
/** @typedef {import('./domain.js').TodoId} TodoId */

/**
 * @typedef {object} RowView
 * @property {TodoId} id
 * @property {StatusId} status
 * @property {string} title
 * @property {boolean} struck
 * @property {boolean} overdue
 * @property {string} accent
 * @property {{ label: string, accent: string }} priority
 * @property {{ text: string, overdue: boolean } | null} due null when the todo has no deadline
 * @property {string[]} tags already '#'-prefixed
 * @property {string} assignee
 * @property {{ label: string, title: string, disabled: boolean }} advance
 * @property {string} editLabel
 * @property {string} deleteLabel
 */

/**
 * @typedef {object} GroupView
 * @property {StatusId} status
 * @property {string} label
 * @property {string} accent
 * @property {string} count
 * @property {string | null} empty placeholder text when the group has no rows
 * @property {RowView[]} rows
 */

/**
 * @typedef {object} FieldView
 * @property {string} name
 * @property {string} label
 * @property {'text'|'date'|'select'} control
 * @property {string} value
 * @property {{ value: string, label: string }[] | null} options present for 'select'
 * @property {string | null} hint
 * @property {string | null} error already a Korean message
 */

/**
 * @typedef {object} EditorView
 * @property {TodoId} id
 * @property {string} heading
 * @property {FieldView[]} fields
 * @property {string} submitLabel
 * @property {string} cancelLabel
 */

/**
 * @typedef {object} AppView
 * @property {string} title
 * @property {string} createLabel
 * @property {GroupView[]} groups one per status, in status order
 * @property {EditorView | null} editor
 * @property {{ kind: string, text: string, dismissLabel: string } | null} notice
 * @property {{ text: string, label: string } | null} undo
 */

/**
 * @param {State} state
 * @param {IsoDate} today
 * @returns {AppView}
 */
export function project(state, today) {
  const notice = state.ui.notice;
  const undo = state.ui.undo;
  return {
    title: UI.appTitle,
    createLabel: UI.create,
    groups: STATUS_ORDER.map((status) => projectGroup(state.todos, status, today)),
    editor: state.ui.editor ? projectEditor(state.ui.editor, state.todos) : null,
    notice: notice ? { kind: notice.kind, text: NOTICE[notice.kind](notice), dismissLabel: UI.dismiss } : null,
    undo: undo ? { text: T.deleted(undo.todo.title), label: UI.undo } : null,
  };
}

/**
 * @param {Todo[]} todos
 * @param {StatusId} status
 * @param {IsoDate} today
 * @returns {GroupView}
 */
function projectGroup(todos, status, today) {
  const rows = byStatus(todos, status).map((todo) => projectRow(todo, today));
  return {
    status,
    label: STATUS_LABEL[status],
    accent: STATUSES[status].accent,
    count: T.count(rows.length),
    empty: rows.length === 0 ? UI.empty : null,
    rows,
  };
}

/**
 * @param {Todo} todo
 * @param {IsoDate} today
 * @returns {RowView}
 */
function projectRow(todo, today) {
  const to = nextStatus(todo.status);
  const overdue = isOverdue(todo, today);
  return {
    id: todo.id,
    status: todo.status,
    title: todo.title,
    struck: STATUSES[todo.status].closed,
    overdue,
    accent: STATUSES[todo.status].accent,
    priority: { label: PRIORITY_LABEL[todo.priority], accent: PRIORITIES[todo.priority].accent },
    due: todo.due === null ? null : { text: dueText(todo.due, overdue), overdue },
    tags: todo.tags.map((tag) => T.tag(tag)),
    assignee: todo.assignee,
    advance: to
      ? { label: T.advance(STATUS_LABEL[to]), title: T.advanceTitle(STATUS_LABEL[to]), disabled: false }
      : { label: UI.terminal, title: UI.terminalTitle, disabled: true },
    editLabel: UI.edit,
    deleteLabel: UI.remove,
  };
}

/**
 * @param {IsoDate} due
 * @param {boolean} overdue
 * @returns {string}
 */
function dueText(due, overdue) {
  const monthDay = due.slice(5).replace('-', '/');
  return overdue ? T.overdue(monthDay) : T.due(monthDay);
}

/**
 * @param {Draft} draft
 * @param {Todo[]} todos
 * @returns {EditorView}
 */
function projectEditor(draft, todos) {
  const current = draft.fields.status;
  const targets = allowedTargets(todos, draft.id);
  // The select offers the current status plus the legal moves away from it, so an
  // illegal move is not representable in the UI.
  const statuses = STATUS_ORDER.filter((status) => status === current || targets.includes(status));
  return {
    id: draft.id,
    heading: draft.mode === 'create' ? UI.editorCreate : UI.editorEdit,
    fields: [
      field(draft, 'title', 'text'),
      field(draft, 'status', 'select', statuses.map((status) => ({ value: status, label: STATUS_LABEL[status] }))),
      field(draft, 'priority', 'select', PRIORITY_ORDER.map((priority) => ({ value: priority, label: PRIORITY_LABEL[priority] }))),
      field(draft, 'due', 'date', null, UI.dueHint),
      field(draft, 'tags', 'text', null, UI.tagsHint),
      field(draft, 'assignee', 'text'),
    ],
    submitLabel: UI.save,
    cancelLabel: UI.cancel,
  };
}

/**
 * @param {Draft} draft
 * @param {string} name
 * @param {'text'|'date'|'select'} control
 * @param {{ value: string, label: string }[] | null} [options]
 * @param {string | null} [hint]
 * @returns {FieldView}
 */
function field(draft, name, control, options = null, hint = null) {
  const code = draft.errors ? draft.errors[name] : null;
  return {
    name,
    label: FIELD_LABEL[name],
    control,
    value: draft.fields[name] ?? '',
    options,
    hint,
    error: code ? FIELD_ERROR[code] : null,
  };
}
