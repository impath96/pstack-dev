// Every Korean UI string in the app. A lint enforces that:
//   rg -n '[가-힣]' src --glob '!strings.js' --glob '!index.html'
// and the only lines it may print are the SEED rows in domain.js, which are shipped
// content the verification skill pins by title. No comment anywhere carries Hangul, so
// the check never has to tell code from prose.

import { STATUSES, PRIORITIES } from './domain.js';

/** @typedef {import('./domain.js').StatusId} StatusId */
/** @typedef {import('./domain.js').PriorityId} PriorityId */
/** @typedef {import('./storage.js').Notice} Notice */

/** @type {Record<StatusId, string>} */
export const STATUS_LABEL = {
  todo: '할 일',
  doing: '진행 중',
  done: '완료',
};

/** @type {Record<PriorityId, string>} */
export const PRIORITY_LABEL = {
  high: '높음',
  mid: '보통',
  low: '낮음',
};

/** @type {Record<string, string>} */
export const FIELD_LABEL = {
  title: '제목',
  status: '상태',
  priority: '우선순위',
  due: '마감일',
  tags: '태그',
  assignee: '담당자',
};

export const UI = {
  appTitle: '할 일 목록',
  create: '새 할 일',
  edit: '편집',
  remove: '삭제',
  save: '저장',
  cancel: '취소',
  terminal: '완료됨',
  terminalTitle: '마지막 단계',
  empty: '비어 있음',
  dismiss: '닫기',
  undo: '되돌리기',
  editorCreate: '할 일 추가',
  editorEdit: '할 일 편집',
  tagsHint: '쉼표로 구분',
  dueHint: '없어도 됩니다',
};

/** @type {Record<string, string>} */
export const FIELD_ERROR = {
  required: '필수 항목입니다',
  tooLong: '너무 깁니다',
  badDate: '날짜 형식은 YYYY-MM-DD 입니다',
  badChoice: '선택할 수 없는 값입니다',
};

// Korean composes, it does not concatenate at the call site. Every template that joins a
// value to Korean text lives here so that views.js stays free of Hangul.
export const T = {
  /** @param {number} n */
  count: (n) => `${n}건`,
  /** @param {string} statusLabel */
  advance: (statusLabel) => `${statusLabel} →`,
  /** @param {string} statusLabel */
  advanceTitle: (statusLabel) => `${statusLabel}(으)로 이동`,
  /** @param {string} monthDay e.g. '10/26' */
  due: (monthDay) => monthDay,
  /** @param {string} monthDay */
  overdue: (monthDay) => `${monthDay} 지남`,
  /** @param {string} tag */
  tag: (tag) => `#${tag}`,
  /** @param {string} title */
  deleted: (title) => `'${title}'을(를) 삭제했습니다`,
};

/**
 * Storage notices. One entry per Notice kind, so a kind added without a message is a
 * crash in review rather than a blank banner in front of a user.
 * @type {Record<Notice['kind'], (notice: Notice) => string>}
 */
export const NOTICE = {
  memory: () => '이 브라우저에서는 저장할 수 없습니다. 변경 내용은 새로고침하면 사라집니다.',
  quota: () => '저장 공간이 가득 차 방금 변경한 내용을 저장하지 못했습니다.',
  corrupt: () => '저장된 데이터를 읽을 수 없어 기본 목록으로 시작합니다. 이전 데이터는 따로 보관했습니다.',
  dropped: (notice) => `${notice.count}건을 읽지 못해 건너뛰었습니다.`,
  newer: () => '더 새 버전에서 저장한 데이터가 있어 읽지 않았습니다. 이 탭의 변경 내용은 저장되지 않습니다.',
  adopted: () => '다른 탭에서 변경한 내용을 반영했습니다.',
};

/**
 * Labels cannot be derived from the domain tables, so they are checked against them at
 * import. A status added without a label fails the first page load, not a later click.
 * @param {Record<string, unknown>} labels
 * @param {Record<string, unknown>} table
 * @param {string} name
 */
function assertCovers(labels, table, name) {
  const missing = Object.keys(table).filter((key) => !(key in labels));
  const extra = Object.keys(labels).filter((key) => !(key in table));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${name} labels do not match the domain table (missing: ${missing}, extra: ${extra})`);
  }
}

assertCovers(STATUS_LABEL, STATUSES, 'status');
assertCovers(PRIORITY_LABEL, PRIORITIES, 'priority');
