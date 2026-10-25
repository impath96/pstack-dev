// DOM construction. Takes an AppView and writes it into the page.
//
// This file knows no domain rule. It imports nothing at runtime, never sorts, never asks
// whether something is overdue or which status comes next, and contains no Hangul: every
// string it renders arrived inside the AppView.

/** @typedef {import('./view-model.js').AppView} AppView */
/** @typedef {import('./view-model.js').EditorView} EditorView */
/** @typedef {import('./view-model.js').FieldView} FieldView */
/** @typedef {import('./view-model.js').GroupView} GroupView */
/** @typedef {import('./view-model.js').RowView} RowView */

/**
 * The module's whole public surface. The shell calls this and nothing else.
 *
 * Idempotent by construction: calling it twice with equal views leaves the same DOM, so
 * the shell never tracks what it has already drawn.
 *
 * @param {HTMLElement} root the `#app` element
 * @param {AppView} view
 * @returns {void}
 */
export function renderApp(root, view) {
  root.querySelector('[data-title]').textContent = view.title;
  root.querySelector('[data-create]').textContent = view.createLabel;

  root.querySelector('#notice-host').replaceChildren(
    ...[renderNotice(view.notice), renderUndo(view.undo)].filter(Boolean)
  );

  const panel = h('div', { class: 'list' });
  view.groups.forEach((group) => panel.append(renderGroup(group)));
  root.querySelector('#view').replaceChildren(panel);

  syncEditor(/** @type {HTMLDialogElement} */ (root.querySelector('#editor')), view.editor);
}

/**
 * @param {GroupView} group
 * @returns {DocumentFragment} one `.group` header followed by its rows
 */
function renderGroup(group) {
  const fragment = document.createDocumentFragment();
  fragment.append(
    h('div', { class: 'group', 'data-status': group.status }, [
      h('span', { class: 'dot', style: { background: group.accent } }),
      group.label,
      h('span', { class: 'count' }, group.count),
    ])
  );
  if (group.rows.length === 0) fragment.append(h('div', { class: 'empty' }, group.empty));
  group.rows.forEach((row) => fragment.append(renderRow(row)));
  return fragment;
}

/**
 * @param {RowView} row
 * @returns {HTMLElement} `.row[data-id]`, the grid from styles.css
 */
function renderRow(row) {
  // The row itself carries no click handler. Clicking its text or the panel background
  // does nothing, so every mutation needs an explicit control.
  return h(
    'div',
    { class: 'row', 'data-id': row.id, 'data-status': row.status, 'data-overdue': row.overdue ? 'true' : null },
    [
      h('span', { class: 'dot', style: { background: row.accent } }),
      h('span', { class: `title${row.struck ? ' struck' : ''}` }, row.title),
      h('span', { class: 'tags' }, row.tags.map((tag) => h('span', { class: 'tag' }, tag))),
      h('span', { class: 'chip', style: { background: `${row.priority.accent}1a`, color: row.priority.accent } }, row.priority.label),
      h('span', { class: 'who' }, row.assignee),
      row.due
        ? h('span', { class: `chip due${row.due.overdue ? ' overdue' : ''}` }, row.due.text)
        : h('span', { class: 'due' }),
      h('button', {
        type: 'button',
        class: 'advance',
        'data-advance': row.id,
        title: row.advance.title,
        disabled: row.advance.disabled || null,
      }, row.advance.label),
      h('button', { type: 'button', class: 'row-action', 'data-edit': row.id }, row.editLabel),
      h('button', { type: 'button', class: 'row-action danger', 'data-delete': row.id }, row.deleteLabel),
    ]
  );
}

/**
 * @param {AppView['notice']} notice
 * @returns {HTMLElement | null}
 */
function renderNotice(notice) {
  if (!notice) return null;
  return h('div', { id: 'notice', class: 'bar notice', 'data-notice': notice.kind, role: 'status' }, [
    h('span', { class: 'bar-text' }, notice.text),
    h('button', { type: 'button', class: 'row-action', 'data-dismiss': '' }, notice.dismissLabel),
  ]);
}

/**
 * @param {AppView['undo']} undo
 * @returns {HTMLElement | null}
 */
function renderUndo(undo) {
  if (!undo) return null;
  return h('div', { class: 'bar undo', role: 'status' }, [
    h('span', { class: 'bar-text' }, undo.text),
    h('button', { type: 'button', class: 'row-action', 'data-undo': '' }, undo.label),
  ]);
}

/**
 * @param {HTMLDialogElement} dialog
 * @param {EditorView | null} editor
 * @returns {void}
 */
function syncEditor(dialog, editor) {
  const form = dialog.querySelector('form');
  if (!editor) {
    if (dialog.open) dialog.close();
    delete dialog.dataset.editor;
    delete dialog.dataset.errors;
    form.replaceChildren();
    return;
  }

  // The one piece of reconciliation in the app, and it earns its place: the dialog is
  // uncontrolled, the DOM holds what the user is typing, and a redraw triggered by
  // another tab's write must not wipe a half-typed title.
  const errors = editor.fields.map((field) => `${field.name}:${field.error ?? ''}`).join('|');
  if (dialog.dataset.editor === String(editor.id) && dialog.dataset.errors === errors) {
    if (!dialog.open) dialog.showModal();
    return;
  }

  form.replaceChildren(
    h('h2', {}, editor.heading),
    ...editor.fields.map(renderField),
    h('div', { class: 'actions' }, [
      h('button', { type: 'button', class: 'row-action', 'data-cancel': '' }, editor.cancelLabel),
      h('button', { type: 'submit', class: 'primary', 'data-submit': '' }, editor.submitLabel),
    ])
  );
  dialog.dataset.editor = String(editor.id);
  dialog.dataset.errors = errors;
  if (!dialog.open) dialog.showModal();

  const failed = editor.fields.find((field) => field.error);
  const focus = form.querySelector(`[data-field="${failed ? failed.name : editor.fields[0].name}"]`);
  if (focus) focus.focus();
}

/**
 * @param {FieldView} field
 * @returns {HTMLElement} a label wrapping the control, which carries [data-field]
 */
function renderField(field) {
  const control = field.options
    ? h('select', { 'data-field': field.name }, field.options.map((option) =>
        h('option', { value: option.value, selected: option.value === field.value || null }, option.label)))
    : h('input', { type: field.control === 'date' ? 'date' : 'text', 'data-field': field.name, value: field.value });

  return h('label', { class: `field${field.error ? ' has-error' : ''}` }, [
    h('span', { class: 'field-label' }, field.label),
    control,
    field.hint ? h('span', { class: 'hint' }, field.hint) : null,
    field.error ? h('span', { class: 'error' }, field.error) : null,
  ]);
}

/**
 * @param {string} tag
 * @param {Record<string, unknown>} props
 * @param {Node[]|string|Node} children
 * @returns {HTMLElement}
 */
function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    // Object.assign skips custom properties, so a --var needs setProperty.
    if (key === 'style') Object.entries(value).forEach(([prop, val]) => node.style.setProperty(prop, val));
    else if (value !== null && value !== false) node.setAttribute(key, String(value));
  });
  [].concat(children).filter(Boolean).forEach((child) => node.append(child));
  return node;
}
