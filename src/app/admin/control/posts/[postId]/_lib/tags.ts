import { SLUG_PATTERN, TAG_NAME_MAX_LENGTH } from './post-form';

import type { PostTag, TagOption } from './post-form';


/**
 * 入力候補として表示するタグの最大数。
 */
const MAX_SUGGESTIONS = 8;


/**
 * 検索用に文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 正規化する文字列
 * @returns 正規化した文字列
 */
export function normalizeForSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim();
}


/**
 * 入力されたタグ名を整える（前後の空白と、先頭の `#` を取り除く）。
 *
 * @param value - 入力されたタグ名
 * @returns 整えたタグ名
 */
export function cleanTagName(value: string): string {
  return value.trim().replace(/^[#＃]+/, '').trim();
}


/**
 * タグ名からスラッグの候補を生成する。英数字以外はハイフンに置き換え、英数字を含まない場合は空文字列を返す。
 *
 * @param name - タグ名
 * @returns スラッグの候補
 */
export function suggestTagSlug(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}


/**
 * 入力中の文字列に一致するタグの候補を返す。
 *
 * 前方一致を優先し、その中では使用されている記事が多い順に並べる。入力が空の場合はよく使われているタグを返す。
 *
 * @param options - 既存のタグ
 * @param selected - 選択済みのタグ（候補から除く）
 * @param query - 入力中の文字列
 * @returns タグの候補
 */
export function findTagSuggestions(
  options: readonly TagOption[],
  selected: readonly PostTag[],
  query: string,
): TagOption[] {
  const selectedSlugs = new Set(selected.map((tag) => tag.slug));
  const normalizedQuery = normalizeForSearch(cleanTagName(query));
  return options
    .filter((option) => !selectedSlugs.has(option.slug))
    .map((option) => {
      const name = normalizeForSearch(option.name);
      let rank = 2;
      if (normalizedQuery === '') {
        rank = 0;
      } else if (name.startsWith(normalizedQuery) || option.slug.startsWith(normalizedQuery)) {
        rank = 0;
      } else if (name.includes(normalizedQuery) || option.slug.includes(normalizedQuery)) {
        rank = 1;
      }
      return { option, rank };
    })
    .filter(({ rank }) => rank < 2)
    .toSorted((a, b) => (
      a.rank - b.rank
      || b.option.postCount - a.option.postCount
      || a.option.name.localeCompare(b.option.name, 'ja')
    ))
    .slice(0, MAX_SUGGESTIONS)
    .map(({ option }) => option);
}


/**
 * 名前が一致する既存のタグ（または選択済みのタグ）を探す。
 *
 * @param tags - 探す対象のタグ
 * @param name - タグ名
 * @returns 名前が一致するタグ。存在しない場合は `undefined`
 */
export function findTagByName<T extends PostTag>(tags: readonly T[], name: string): T | undefined {
  const normalizedName = normalizeForSearch(name);
  return tags.find((tag) => normalizeForSearch(tag.name) === normalizedName);
}


/**
 * 新しく作成するタグの入力内容を検証する。
 *
 * @param tag - 作成するタグ
 * @param options - 既存のタグ
 * @param selected - 選択済みのタグ
 * @returns エラーメッセージ。問題がない場合は `null`
 */
export function validateNewTag(
  tag: PostTag,
  options: readonly TagOption[],
  selected: readonly PostTag[],
): string | null {
  if (tag.name === '') {
    return 'タグ名を入力してください。';
  }
  if (tag.name.length > TAG_NAME_MAX_LENGTH) {
    return `タグ名は${TAG_NAME_MAX_LENGTH}文字以内で入力してください。`;
  }
  if (!SLUG_PATTERN.test(tag.slug)) {
    return 'スラッグは半角英小文字・数字・ハイフンで入力してください（先頭と末尾のハイフンは不可）。';
  }
  const all = [...options, ...selected];
  const sameName = findTagByName(all, tag.name);
  if (sameName) {
    return `「${sameName.name}」というタグは既に存在します。`;
  }
  const sameSlug = all.find((option) => option.slug === tag.slug);
  if (sameSlug) {
    return `スラッグ「${tag.slug}」はタグ「${sameSlug.name}」で使われています。`;
  }
  return null;
}
