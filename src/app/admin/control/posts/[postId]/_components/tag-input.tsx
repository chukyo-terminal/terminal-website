'use client';

import { useId, useRef, useState } from 'react';

import { Plus, X } from 'lucide-react';

import { MAX_TAGS_PER_POST, TAG_NAME_MAX_LENGTH } from '../_lib/post-form';
import { cleanTagName, findTagByName, findTagSuggestions, suggestTagSlug, validateNewTag } from '../_lib/tags';

import type { JSX, KeyboardEvent } from 'react';
import type { PostTag, TagOption } from '../_lib/post-form';


/**
 * 新しいタグの作成欄の入力欄の共通クラス。
 */
const DRAFT_INPUT_CLASS_NAME = 'rounded border border-gray-600 bg-gray-900 px-2 py-1 text-gray-100 '
  + 'focus:outline-none focus:ring-2 focus:ring-emerald-500';


/**
 * 候補一覧の項目（既存のタグの選択、または新しいタグの作成）。
 */
type SuggestionItem =
  | { kind: 'existing'; tag: TagOption }
  | { kind: 'create'; name: string };


type TagInputProperties = {
  /** 入力欄の ID（ラベルとの関連付けに使用する） */
  id: string;
  /** 選択中のタグ */
  value: readonly PostTag[];
  /** 既存のタグ */
  options: readonly TagOption[];
  onChange: (tags: PostTag[]) => void;
  /** 入力欄の説明となる要素の ID */
  describedBy?: string;
  isInvalid?: boolean;
};


/**
 * 記事に設定するタグの入力欄。
 *
 * 既存のタグを候補から選択できるほか、新しいタグを作成できる（作成したタグは記事の保存時に登録される）。
 *
 * @param properties - プロパティ
 * @returns タグの入力欄
 */
export default function TagInput({
  id,
  value,
  options,
  onChange,
  describedBy,
  isInvalid = false,
}: TagInputProperties): JSX.Element {
  const listId = useId();
  const inputReference = useRef<HTMLInputElement>(null);
  const slugInputReference = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [draftTag, setDraftTag] = useState<PostTag | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  const isFull = value.length >= MAX_TAGS_PER_POST;
  const optionSlugs = new Set(options.map((option) => option.slug));
  const cleanedQuery = cleanTagName(query);

  const items: SuggestionItem[] = findTagSuggestions(options, value, query).map((tag) => ({ kind: 'existing', tag }));
  // 入力した名前のタグが存在しない場合は、新しく作成できるようにする
  if (cleanedQuery !== '' && !findTagByName(options, cleanedQuery) && !findTagByName(value, cleanedQuery)) {
    items.push({ kind: 'create', name: cleanedQuery.slice(0, TAG_NAME_MAX_LENGTH) });
  }
  const isListVisible = isOpen && !isFull && draftTag === null && items.length > 0;
  const selectedDuplicate = cleanedQuery === '' ? undefined : findTagByName(value, cleanedQuery);

  /**
   * タグを追加する。
   *
   * @param tag - 追加するタグ
   */
  function addTag(tag: PostTag): void {
    onChange([...value, { name: tag.name, slug: tag.slug }]);
    setQuery('');
    setActiveIndex(-1);
  }

  /**
   * タグを外す。
   *
   * @param slug - 外すタグのスラッグ
   */
  function removeTag(slug: string): void {
    onChange(value.filter((tag) => tag.slug !== slug));
    inputReference.current?.focus();
  }

  /**
   * 新しいタグの作成を始める。
   *
   * @param name - 作成するタグの名前
   */
  function startCreating(name: string): void {
    const slug = suggestTagSlug(name);
    setDraftTag({ name, slug });
    setDraftError(null);
    setIsOpen(false);
    // スラッグを自動で決められなかった場合は、スラッグの入力欄にフォーカスする
    requestAnimationFrame(() => {
      slugInputReference.current?.focus();
      if (slug !== '') {
        slugInputReference.current?.select();
      }
    });
  }

  /**
   * 新しいタグの作成を終える。
   */
  function stopCreating(): void {
    setDraftTag(null);
    setDraftError(null);
    inputReference.current?.focus();
  }

  /**
   * 入力中の新しいタグを追加する。
   */
  function submitDraftTag(): void {
    if (!draftTag) {
      return;
    }
    const tag = { name: cleanTagName(draftTag.name), slug: draftTag.slug.trim() };
    const error = validateNewTag(tag, options, value);
    if (error) {
      setDraftError(error);
      return;
    }
    addTag(tag);
    stopCreating();
  }

  /**
   * 候補一覧の項目を選択する。
   *
   * @param item - 選択した項目
   */
  function selectItem(item: SuggestionItem): void {
    if (item.kind === 'existing') {
      addTag(item.tag);
    } else {
      startCreating(item.name);
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // IME で変換中のキー操作は無視する
    if (event.nativeEvent.isComposing) {
      return;
    }
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
          return;
        }
        if (items.length > 0) {
          // 未選択（-1）→ 先頭 → … → 末尾 → 未選択 の順に循環させる
          const step = event.key === 'ArrowDown' ? 1 : -1;
          const positionCount = items.length + 1;
          setActiveIndex((index) => ((index + 1 + step + positionCount) % positionCount) - 1);
        }
        return;
      }
      case 'Enter': {
        event.preventDefault();
        const activeItem = isListVisible ? items.at(activeIndex) : undefined;
        if (activeIndex >= 0 && activeItem) {
          selectItem(activeItem);
          return;
        }
        if (cleanedQuery === '') {
          return;
        }
        // 候補を選ばずに Enter を押した場合は、名前が一致するタグを追加するか、新しく作成する
        const existing = findTagByName(options, cleanedQuery);
        if (existing && !findTagByName(value, cleanedQuery)) {
          addTag(existing);
        } else if (!existing && !selectedDuplicate) {
          startCreating(cleanedQuery.slice(0, TAG_NAME_MAX_LENGTH));
        }
        return;
      }
      case 'Escape': {
        if (isOpen) {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen(false);
          setActiveIndex(-1);
        }
        return;
      }
      case 'Backspace': {
        const lastTag = value.at(-1);
        if (query === '' && lastTag) {
          event.preventDefault();
          removeTag(lastTag.slug);
        }
        return;
      }
      default: {
        return;
      }
    }
  };

  return (
    <div className="relative">
      <div
        className={
          'flex flex-wrap items-center gap-1.5 rounded border bg-gray-900 px-2 py-1.5 '
          + 'focus-within:ring-2 focus-within:ring-emerald-500 '
          + (isInvalid ? 'border-red-500' : 'border-gray-600')
        }
        onClick={() => inputReference.current?.focus()}
      >
        {value.map((tag) => {
          const isNew = !optionSlugs.has(tag.slug);
          return (
            <span
              key={tag.slug}
              title={isNew ? `新しいタグ（スラッグ: ${tag.slug}）。記事の保存時に作成されます。` : `スラッグ: ${tag.slug}`}
              className={
                'inline-flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-sm '
                + (isNew
                  ? 'border-dashed border-emerald-500/60 text-emerald-200'
                  : 'border-transparent bg-emerald-500/15 text-emerald-300')
              }
            >
              <span className="truncate">#{tag.name}</span>
              {isNew && <span className="text-[10px] text-emerald-400">新規</span>}
              <button
                type="button"
                aria-label={`タグ「${tag.name}」を外す`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeTag(tag.slug);
                }}
                className="rounded-full p-0.5 text-emerald-300/70 hover:bg-emerald-500/20 hover:text-white"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </span>
          );
        })}
        <input
          ref={inputReference}
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isListVisible}
          aria-controls={listId}
          aria-activedescendant={isListVisible && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          aria-describedby={describedBy}
          aria-invalid={isInvalid}
          value={query}
          disabled={isFull}
          maxLength={TAG_NAME_MAX_LENGTH + 1}
          placeholder={isFull ? `タグは${MAX_TAGS_PER_POST}個まで設定できます` : 'タグを入力（Enter で追加）'}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
          className={
            'min-w-32 flex-1 bg-transparent py-0.5 text-sm placeholder:text-gray-500 focus:outline-none '
            + 'disabled:cursor-not-allowed'
          }
        />
      </div>

      {selectedDuplicate && draftTag === null && (
        <p className="mt-1 text-xs text-gray-400">「{selectedDuplicate.name}」は設定済みです。</p>
      )}

      {/* 候補一覧 */}
      <ul
        id={listId}
        role="listbox"
        aria-label="タグの候補"
        hidden={!isListVisible}
        className={
          'absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-gray-700 bg-gray-800 py-1 '
          + 'shadow-lg'
        }
      >
        {items.map((item, index) => (
          <li
            key={item.kind === 'existing' ? item.tag.slug : '__create__'}
            id={`${listId}-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            // 入力欄のフォーカスを維持する
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={() => selectItem(item)}
            className={
              'flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm '
              + (index === activeIndex ? 'bg-gray-700 text-white' : 'text-gray-200')
            }
          >
            {item.kind === 'existing' ? (
              <>
                <span className="truncate">
                  #{item.tag.name}
                  <span className="ml-2 font-mono text-xs text-gray-500">{item.tag.slug}</span>
                </span>
                <span className="shrink-0 text-xs text-gray-500">{item.tag.postCount}件</span>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <Plus className="h-4 w-4" aria-hidden />
                新しいタグ「{item.name}」を作成
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* 新しいタグの作成 */}
      {draftTag && (
        <div
          role="group"
          aria-label="新しいタグの作成"
          className="mt-2 flex flex-col gap-2 rounded-lg border border-emerald-500/40 bg-gray-800/60 p-3"
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              submitDraftTag();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              stopCreating();
            }
          }}
        >
          <p className="text-xs font-medium text-emerald-300">新しいタグを作成</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              タグ名
              <input
                type="text"
                value={draftTag.name}
                maxLength={TAG_NAME_MAX_LENGTH}
                onChange={(event) => {
                  const name = event.target.value;
                  // スラッグを手動で変更していない場合は、タグ名に合わせて更新する
                  setDraftTag((previous) => previous && ({
                    name,
                    slug: previous.slug === suggestTagSlug(previous.name) ? suggestTagSlug(name) : previous.slug,
                  }));
                  setDraftError(null);
                }}
                className={`${DRAFT_INPUT_CLASS_NAME} text-sm`}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-400">
              スラッグ（URL に使用）
              <input
                ref={slugInputReference}
                type="text"
                value={draftTag.slug}
                placeholder="例: programming"
                spellCheck={false}
                autoCapitalize="none"
                onChange={(event) => {
                  const slug = event.target.value.toLowerCase().replaceAll(/[\s_]+/g, '-');
                  setDraftTag((previous) => previous && { ...previous, slug });
                  setDraftError(null);
                }}
                className={`${DRAFT_INPUT_CLASS_NAME} font-mono text-sm`}
              />
            </label>
          </div>
          {draftError && <p role="alert" className="text-xs text-red-400">{draftError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={stopCreating}
              className="rounded bg-gray-600 px-3 py-1 text-sm hover:bg-gray-500"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={submitDraftTag}
              className="rounded bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
            >
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
