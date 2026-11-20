'use client';

import Image from 'next/image';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import {
  Check, CircleAlert, ImageIcon, ImagePlus, ImageUp, LoaderCircle, RotateCw, Search, SearchX, X,
} from 'lucide-react';
import ReactModal from 'react-modal';

import { IMAGE_ACCEPT, MAX_IMAGE_FILE_SIZE, formatFileSize, getImagePath } from '@/lib/images';

import type { DragEvent, JSX } from 'react';
import type { ManagedImage } from '@/lib/images';
import type { ActionResult } from '@/types';


/**
 * 表示する画像の範囲。
 */
const SCOPES = [
  { value: 'all', label: 'すべて' },
  { value: 'post', label: 'この記事で使用中' },
  { value: 'unused', label: '未使用' },
] as const;

type Scope = typeof SCOPES[number]['value'];


/**
 * 一覧のサムネイルの表示幅（`next/image` の `sizes`）。
 */
const THUMBNAIL_SIZES = '(min-width: 1280px) 16vw, (min-width: 1024px) 20vw, (min-width: 640px) 25vw, 50vw';


/**
 * 透過した画像を見やすくするための、市松模様の背景。
 */
const CHECKERBOARD_STYLE = {
  backgroundColor: '#111827',
  backgroundImage: 'conic-gradient(#1f2937 25%, transparent 0 50%, #1f2937 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
};


/**
 * 検索のために文字列を正規化する（全角・半角や大文字・小文字の違いを無視する）。
 *
 * @param value - 文字列
 * @returns 正規化した文字列
 */
const normalizeForSearch = (value: string): string => value.normalize('NFKC').toLowerCase().trim();


/**
 * 画像が表示する範囲に含まれるかどうかを判定する。
 *
 * @param image - 画像
 * @param scope - 表示する範囲
 * @param postId - 編集中の記事のID
 * @returns 含まれる場合は `true`
 */
function matchesScope(image: ManagedImage, scope: Scope, postId: number): boolean {
  switch (scope) {
    case 'all': {
      return true;
    }
    case 'post': {
      return image.usages.some((usage) => usage.postId === postId);
    }
    case 'unused': {
      return image.usages.length === 0;
    }
  }
}


/**
 * ドラッグしているものにファイルが含まれるかどうかを判定する。
 *
 * @param event - ドラッグのイベント
 * @returns ファイルが含まれる場合は `true`
 */
const hasFiles = (event: DragEvent): boolean => event.dataTransfer.types.includes('Files');


type ImagePickerDialogProperties = {
  /** 編集中の記事のID（この記事で使用中の画像を絞り込むために使う） */
  postId: number;
  /** アップロード済みの画像を読み込む */
  onLoad: () => Promise<ActionResult<ManagedImage[]>>;
  /** 選択した画像を挿入する（選択した順） */
  onInsert: (images: ManagedImage[]) => void;
  /** 新しい画像をアップロードして挿入する */
  onUpload: (files: File[]) => void;
  onRequestClose: () => void;
};


/**
 * 本文に挿入する画像を選ぶダイアログ。アップロード済みの画像から選ぶか、新しい画像をアップロードできる。
 *
 * @param properties - プロパティ
 * @returns ダイアログ
 */
export default function ImagePickerDialog({
  postId,
  onLoad,
  onInsert,
  onUpload,
  onRequestClose,
}: ImagePickerDialogProperties): JSX.Element {
  const fileInputReference = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ManagedImage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const visibleImages = useMemo(() => {
    const normalizedQuery = normalizeForSearch(query);
    return (images ?? []).filter((image) => (
      matchesScope(image, scope, postId)
      && (normalizedQuery === '' || normalizeForSearch(image.fileName).includes(normalizedQuery))
    ));
  }, [images, query, scope, postId]);
  const scopeCounts = useMemo(() => Object.fromEntries(SCOPES.map(({ value }) => [
    value,
    (images ?? []).filter((image) => matchesScope(image, value, postId)).length,
  ])) as Record<Scope, number>, [images, postId]);

  /**
   * アップロード済みの画像を読み込む。
   */
  async function load(): Promise<void> {
    setLoadError(null);
    try {
      const result = await onLoad();
      if (result.ok) {
        setImages(result.data);
      } else {
        setLoadError(result.error);
      }
    } catch (e) {
      console.error('Failed to load images:', e);
      setLoadError('画像を読み込めませんでした。通信状況を確認してください。');
    }
  }

  const loadOnOpen = useEffectEvent(() => load());
  useEffect(() => {
    loadOnOpen();
  }, []);

  /**
   * 画像の選択を切り替える。
   *
   * @param id - 画像ID
   */
  function toggleSelection(id: string): void {
    setSelectedIds((previous) => (
      previous.includes(id) ? previous.filter((current) => current !== id) : [...previous, id]
    ));
  }

  /**
   * 画像を挿入して閉じる。
   *
   * @param ids - 挿入する画像のID（挿入する順）
   */
  function insert(ids: readonly string[]): void {
    const byId = new Map((images ?? []).map((image) => [image.id, image]));
    const targets = ids.flatMap((id) => byId.get(id) ?? []);
    if (targets.length > 0) {
      onInsert(targets);
    }
  }

  /**
   * ドロップされたファイルをアップロードする。
   *
   * @param event - ドロップのイベント
   */
  function handleDrop(event: DragEvent): void {
    if (!hasFiles(event)) {
      return;
    }
    event.preventDefault();
    setIsDragging(false);
    onUpload([...event.dataTransfer.files]);
  }

  let body: JSX.Element;
  if (loadError) {
    body = (
      <div role="alert" className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm">
        <CircleAlert className="h-8 w-8 text-red-400" aria-hidden />
        <p className="text-red-200">{loadError}</p>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded border border-gray-600 px-3 py-1.5 hover:bg-gray-700"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          再読み込み
        </button>
      </div>
    );
  } else if (images === null) {
    body = (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-gray-400" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden />
        画像を読み込み中…
      </div>
    );
  } else if (visibleImages.length === 0) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-gray-400">
        {images.length === 0
          ? <ImageIcon className="h-10 w-10 text-gray-600" aria-hidden />
          : <SearchX className="h-8 w-8 text-gray-600" aria-hidden />}
        <p>
          {images.length === 0
            ? 'まだ画像がありません。「新しい画像をアップロード」から追加してください。'
            : '条件に一致する画像はありません。'}
        </p>
      </div>
    );
  } else {
    body = (
      <ul
        aria-label="アップロード済みの画像"
        className={
          'grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-y-auto p-4 '
          + 'sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
        }
      >
        {visibleImages.map((image) => {
          const selectedIndex = selectedIds.indexOf(image.id);
          const isSelected = selectedIndex !== -1;
          const isUsedInPost = image.usages.some((usage) => usage.postId === postId);
          return (
            <li key={image.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${image.fileName}（${image.width}×${image.height}）`}
                title={`${image.fileName}\nダブルクリックですぐに挿入`}
                onClick={() => toggleSelection(image.id)}
                onDoubleClick={() => insert([image.id])}
                className={
                  'group flex w-full flex-col overflow-hidden rounded-lg border text-left transition-colors '
                  + 'focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 '
                  + (isSelected
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-gray-700 bg-gray-900/40 hover:border-emerald-500/50')
                }
              >
                <span className="relative block aspect-square w-full overflow-hidden" style={CHECKERBOARD_STYLE}>
                  <Image
                    src={getImagePath(image.id)}
                    alt=""
                    fill
                    sizes={THUMBNAIL_SIZES}
                    // GIF（アニメーションの可能性がある）は最適化できないため、そのまま表示する
                    unoptimized={image.mimeType === 'image/gif'}
                    draggable={false}
                    className="object-cover"
                  />
                  <span
                    aria-hidden
                    className={
                      'absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full border-2 text-xs '
                      + 'font-bold tabular-nums '
                      + (isSelected
                        ? 'border-emerald-400 bg-emerald-500 text-white'
                        : 'border-white/70 bg-gray-900/50 text-transparent group-hover:border-white')
                    }
                  >
                    {isSelected ? (selectedIds.length > 1 ? selectedIndex + 1 : <Check className="h-3.5 w-3.5" />) : ''}
                  </span>
                  {isUsedInPost && (
                    <span
                      className={
                        'absolute bottom-2 left-2 rounded-full bg-gray-900/80 px-2 py-0.5 text-xs text-emerald-300'
                      }
                    >
                      この記事で使用中
                    </span>
                  )}
                </span>
                <span className="flex flex-col gap-0.5 px-2 py-1.5">
                  <span className="truncate text-xs text-gray-100">{image.fileName}</span>
                  <span className="text-[11px] text-gray-500">
                    {image.width}×{image.height} · {formatFileSize(image.size)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ReactModal
      isOpen={true}
      onRequestClose={onRequestClose}
      contentLabel="画像を挿入"
      className={
        'fixed inset-2 flex flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg outline-none '
        + 'sm:inset-6 lg:inset-x-16 lg:inset-y-10'
      }
      overlayClassName="fixed inset-0 z-[100] bg-[rgba(55,65,81,0.8)]"
      ariaHideApp={false}
    >
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragEnter={(event) => {
          if (hasFiles(event)) {
            setIsDragging(true);
          }
        }}
        onDragOver={(event) => {
          if (hasFiles(event)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDragLeave={(event) => {
          // ダイアログの外に出た場合のみ、ドラッグ中の表示を消す
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        {/* ヘッダー */}
        <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-3">
          <ImagePlus className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">画像を挿入</h2>
            <p className="text-xs text-gray-400">
              アップロード済みの画像から選ぶか、新しい画像をアップロードしてください。複数選ぶと、選んだ順に挿入されます。
            </p>
          </div>
          <button
            type="button"
            aria-label="閉じる"
            onClick={onRequestClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* アップロード・絞り込み */}
        <div className="flex flex-col gap-3 border-b border-gray-700 px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button
              type="button"
              onClick={() => fileInputReference.current?.click()}
              className={
                'inline-flex items-center gap-2 rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white '
                + 'hover:bg-emerald-700'
              }
            >
              <ImageUp className="h-4 w-4" aria-hidden />
              新しい画像をアップロード
            </button>
            <span className="text-xs text-gray-500">
              JPEG・PNG・GIF・WebP・AVIF（{formatFileSize(MAX_IMAGE_FILE_SIZE)}まで）。ここにドロップしてもアップロードできます。
            </span>
            <input
              ref={fileInputReference}
              type="file"
              accept={IMAGE_ACCEPT}
              multiple
              hidden
              onChange={(event) => {
                const files = [...(event.target.files ?? [])];
                event.target.value = '';
                if (files.length > 0) {
                  onUpload(files);
                }
              }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="表示する画像" className="flex flex-wrap gap-1">
              {SCOPES.map((item) => {
                const isActive = scope === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setScope(item.value)}
                    className={
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors '
                      + (isActive
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200')
                    }
                  >
                    {item.label}
                    {images && <span className="text-xs tabular-nums opacity-80">{scopeCounts[item.value]}</span>}
                  </button>
                );
              })}
            </div>
            <div className="relative min-w-48 flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="ファイル名で検索"
                aria-label="ファイル名で検索"
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 py-1.5 pr-3 pl-9 text-sm text-gray-200 '
                  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500'
                }
              />
            </div>
          </div>
        </div>

        {body}

        {/* フッター */}
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-700 px-4 py-3">
          <span className="text-sm text-gray-400" aria-live="polite">
            {selectedIds.length > 0 ? `${selectedIds.length}件を選択中` : '画像を選択してください'}
          </span>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              選択を解除
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onRequestClose} className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500">
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => insert(selectedIds)}
              disabled={selectedIds.length === 0}
              className={
                'rounded bg-emerald-600 px-4 py-2 font-medium text-white enabled:hover:bg-emerald-700 '
                + 'disabled:cursor-not-allowed disabled:opacity-50'
              }
            >
              挿入
            </button>
          </div>
        </div>

        {/* ドラッグ中の表示 */}
        {isDragging && (
          <div
            aria-hidden
            className={
              'pointer-events-none absolute inset-2 flex flex-col items-center justify-center gap-3 rounded-lg '
              + 'border-4 border-dashed border-emerald-500/70 bg-gray-900/85 text-emerald-200'
            }
          >
            <ImageUp className="h-12 w-12" />
            <p className="text-lg font-medium">ドロップしてアップロード・挿入</p>
          </div>
        )}
      </div>
    </ReactModal>
  );
}
