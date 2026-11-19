import type { ContactListItem } from './contact';


/**
 * 対応状況による絞り込み。
 *
 * - `needs-reply`: 返信が必要（完了にしておらず、最新のメッセージが問い合わせ者のもの。未対応のものを含む）
 */
export const CONTACT_STATUS_FILTERS = [
  { value: 'all', label: 'すべて' },
  { value: 'needs-reply', label: '要返信' },
  { value: 'new', label: '未対応' },
  { value: 'in-progress', label: '対応中' },
  { value: 'completed', label: '完了' },
] as const;

export type ContactStatusFilter = typeof CONTACT_STATUS_FILTERS[number]['value'];


/**
 * 並び順。
 */
export const CONTACT_SORT_ORDERS = [
  { value: 'received-desc', label: '受付日時が新しい順' },
  { value: 'received-asc', label: '受付日時が古い順' },
  { value: 'activity-desc', label: '最終更新が新しい順' },
] as const;

export type ContactSortOrder = typeof CONTACT_SORT_ORDERS[number]['value'];


/**
 * 担当者による絞り込みのうち、特定の管理者以外のもの（管理者を指定する場合はユーザーIDの文字列）。
 */
export const ASSIGNEE_FILTER_ME = 'me';
export const ASSIGNEE_FILTER_NONE = 'none';


/**
 * お問い合わせ一覧の表示条件。
 */
export type ContactListFilters = {
  /** キーワード（空白区切りで AND 検索） */
  query: string;
  status: ContactStatusFilter;
  /** 担当者（空文字列は指定なし、`me` は自分、`none` は未割り当て、それ以外はユーザーID） */
  assignee: string;
  sort: ContactSortOrder;
};


/**
 * 表示条件の既定値。
 */
export const DEFAULT_CONTACT_FILTERS: ContactListFilters = {
  query: '',
  status: 'all',
  assignee: '',
  sort: 'received-desc',
};


/**
 * URL のクエリパラメータの値を1つの文字列として取り出す。
 *
 * @param value - クエリパラメータの値
 * @returns 文字列（存在しない場合は空文字列）
 */
const firstValue = (value: string | string[] | undefined): string => (Array.isArray(value) ? value[0] : value) ?? '';


/**
 * 担当者の条件として正しい値かどうかを判定する。
 *
 * @param value - 値
 * @returns 正しい場合は `true`
 */
const isValidAssigneeFilter = (value: string): boolean => (
  value === '' || value === ASSIGNEE_FILTER_ME || value === ASSIGNEE_FILTER_NONE || /^\d+$/.test(value)
);


/**
 * URL のクエリパラメータから表示条件を読み取る。不正な値は既定値として扱う。
 *
 * @param parameters - クエリパラメータ
 * @returns 表示条件
 */
export function parseContactListFilters(
  parameters: Record<string, string | string[] | undefined>,
): ContactListFilters {
  const status = firstValue(parameters.status);
  const assignee = firstValue(parameters.assignee);
  const sort = firstValue(parameters.sort);
  return {
    query: firstValue(parameters.q),
    status: CONTACT_STATUS_FILTERS.some((filter) => filter.value === status)
      ? status as ContactStatusFilter
      : DEFAULT_CONTACT_FILTERS.status,
    assignee: isValidAssigneeFilter(assignee) ? assignee : DEFAULT_CONTACT_FILTERS.assignee,
    sort: CONTACT_SORT_ORDERS.some((order) => order.value === sort)
      ? sort as ContactSortOrder
      : DEFAULT_CONTACT_FILTERS.sort,
  };
}


/**
 * 表示条件を URL のクエリパラメータに変換する。既定値の条件は含めない。
 *
 * @param filters - 表示条件
 * @returns クエリパラメータ
 */
export function toSearchParameters(filters: ContactListFilters): URLSearchParams {
  const parameters = new URLSearchParams();
  if (filters.query.trim() !== '') {
    parameters.set('q', filters.query);
  }
  if (filters.status !== DEFAULT_CONTACT_FILTERS.status) {
    parameters.set('status', filters.status);
  }
  if (filters.assignee !== DEFAULT_CONTACT_FILTERS.assignee) {
    parameters.set('assignee', filters.assignee);
  }
  if (filters.sort !== DEFAULT_CONTACT_FILTERS.sort) {
    parameters.set('sort', filters.sort);
  }
  return parameters;
}


/**
 * 既定値以外の絞り込み条件（並び順を除く）が指定されているかどうかを判定する。
 *
 * @param filters - 表示条件
 * @returns 指定されている場合は `true`
 */
export function hasActiveFilters(filters: ContactListFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.assignee !== '';
}


/**
 * お問い合わせが対応状況の条件に一致するかどうかを判定する。
 *
 * @param contact - お問い合わせ
 * @param status - 対応状況の条件
 * @returns 一致する場合は `true`
 */
export function matchesContactStatus(contact: ContactListItem, status: ContactStatusFilter): boolean {
  switch (status) {
    case 'all': {
      return true;
    }
    case 'needs-reply': {
      return contact.needsReply;
    }
    default: {
      return contact.status === status;
    }
  }
}


/**
 * 検索用に文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 正規化する文字列
 * @returns 正規化した文字列
 */
const normalize = (value: string): string => value.normalize('NFKC').toLowerCase();


/**
 * お問い合わせが対応状況以外の条件（キーワード・担当者）に一致するかどうかを判定する。
 *
 * @param contact - お問い合わせ
 * @param filters - 表示条件
 * @param currentUserId - ログイン中のユーザーID（不明な場合は `null`）
 * @returns 一致する場合は `true`
 */
function matchesOtherFilters(
  contact: ContactListItem,
  filters: ContactListFilters,
  currentUserId: number | null,
): boolean {
  switch (filters.assignee) {
    case '': {
      break;
    }
    case ASSIGNEE_FILTER_ME: {
      if (currentUserId === null || contact.assignee?.id !== currentUserId) {
        return false;
      }
      break;
    }
    case ASSIGNEE_FILTER_NONE: {
      if (contact.assignee !== null) {
        return false;
      }
      break;
    }
    default: {
      if (String(contact.assignee?.id) !== filters.assignee) {
        return false;
      }
    }
  }
  const keywords = normalize(filters.query).split(/\s+/).filter((keyword) => keyword !== '');
  if (keywords.length === 0) {
    return true;
  }
  const target = normalize([contact.name, contact.email, contact.subject, contact.content].join('\n'));
  return keywords.every((keyword) => target.includes(keyword));
}


/**
 * 並び順に従って2つのお問い合わせを比較する。
 *
 * @param a - 比較するお問い合わせ
 * @param b - 比較するお問い合わせ
 * @param sort - 並び順
 * @returns 比較結果
 */
function compareContacts(a: ContactListItem, b: ContactListItem, sort: ContactSortOrder): number {
  switch (sort) {
    case 'received-desc': {
      return b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id;
    }
    case 'received-asc': {
      return a.createdAt.getTime() - b.createdAt.getTime() || a.id - b.id;
    }
    case 'activity-desc': {
      return b.lastActivityAt.getTime() - a.lastActivityAt.getTime() || b.id - a.id;
    }
  }
}


/**
 * 表示条件に従ってお問い合わせを絞り込み、並べ替える。
 *
 * @param contacts - お問い合わせ
 * @param filters - 表示条件
 * @param currentUserId - ログイン中のユーザーID（不明な場合は `null`）
 * @returns 絞り込み・並べ替えたお問い合わせ
 */
export function filterAndSortContacts(
  contacts: readonly ContactListItem[],
  filters: ContactListFilters,
  currentUserId: number | null,
): ContactListItem[] {
  return contacts
    .filter((contact) => (
      matchesContactStatus(contact, filters.status) && matchesOtherFilters(contact, filters, currentUserId)
    ))
    .toSorted((a, b) => compareContacts(a, b, filters.sort));
}


/**
 * 対応状況の条件ごとに、一致するお問い合わせの数を数える（対応状況以外の条件は適用する）。
 *
 * @param contacts - お問い合わせ
 * @param filters - 表示条件
 * @param currentUserId - ログイン中のユーザーID（不明な場合は `null`）
 * @returns 対応状況の条件ごとのお問い合わせの数
 */
export function countByContactStatus(
  contacts: readonly ContactListItem[],
  filters: ContactListFilters,
  currentUserId: number | null,
): Record<ContactStatusFilter, number> {
  const counts: Record<ContactStatusFilter, number> = {
    'all': 0, 'needs-reply': 0, 'new': 0, 'in-progress': 0, 'completed': 0,
  };
  for (const contact of contacts) {
    if (!matchesOtherFilters(contact, filters, currentUserId)) {
      continue;
    }
    for (const { value } of CONTACT_STATUS_FILTERS) {
      if (matchesContactStatus(contact, value)) {
        counts[value]++;
      }
    }
  }
  return counts;
}
