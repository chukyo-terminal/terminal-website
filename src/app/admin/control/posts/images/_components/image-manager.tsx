'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';

import {
  ArrowLeft, Check, CircleAlert, CircleCheck, Copy, ExternalLink, ImageIcon, ImageUp, LoaderCircle, Search, SearchX,
  Trash2, TriangleAlert, X,
} from 'lucide-react';
import ReactModal from 'react-modal';

import Modal from '@/components/elements/modal';
import {
  IMAGE_ACCEPT, MAX_IMAGE_FILES_PER_UPLOAD, MAX_IMAGE_FILE_SIZE, formatFileSize, getImagePath, toImageMarkdown,
  uploadImageFiles, validateImageFile,
} from '@/utils/images';

import { formatDateTime } from '../../_lib/date-format';
import {
  DEFAULT_IMAGE_FILTERS, IMAGE_SORT_ORDERS, USAGE_FILTERS, countByUsage, filterAndSortImages, formatImageType,
  getImageUsageStatus,
} from '../_lib/image';

import type { CSSProperties, JSX, ReactNode } from 'react';
import type { ImageListFilters, ImageSortOrder, ManagedImage } from '../_lib/image';
import type { UploadImageAction } from '@/utils/images';
import type { ActionResult } from '@/types';


/**
 * 主要な操作ボタン（画像のアップロード）の共通クラス。
 */
const PRIMARY_BUTTON_CLASS_NAME = 'inline-flex items-center gap-2 rounded bg-emerald-600 px-4 py-2 font-medium '
  + 'text-white hover:bg-emerald-700';


/**
 * モーダル内のボタンの共通クラス。
 */
const MODAL_BUTTON_CLASS_NAME = 'rounded px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60';


/**
 * 一覧が空のときの表示の共通クラス。
 */
const EMPTY_STATE_CLASS_NAME = 'flex flex-col items-center rounded-lg border border-dashed border-gray-700 px-6 '
  + 'text-center';


/**
 * カードの操作ボタンの共通クラス。
 */
const CARD_BUTTON_CLASS_NAME = 'rounded p-1.5 text-gray-400 transition-colors hover:bg-gray-700';


/**
 * 透過した画像を見やすくするための、市松模様の背景。
 */
const CHECKERBOARD_STYLE: CSSProperties = {
  backgroundColor: '#111827',
  backgroundImage: 'conic-gradient(#1f2937 25%, transparent 0 50%, #1f2937 0 75%, transparent 0)',
  backgroundSize: '16px 16px',
};


/**
 * コピーした結果を表示しておく時間（ms）。
 */
const COPY_FEEDBACK_DURATION = 2000;


/**
 * 一覧のサムネイルの表示幅（`next/image` の `sizes`）。
 */
const THUMBNAIL_SIZES = '(min-width: 1280px) 20vw, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw';


/**
 * 表示中のモーダルと、その操作対象の画像。
 */
type ModalState =
  | { type: 'detail'; imageId: string }
  /** `fromDetail` は、詳細画面から開いたかどうか（キャンセルしたら詳細画面に戻る） */
  | { type: 'delete'; imageId: string; fromDetail: boolean };


/**
 * アップロード中のファイル。
 */
type UploadingFile = {
  key: number;
  fileName: string;
};


/**
 * 直前のアップロードの結果。
 */
type UploadSummary = {
  uploadedCount: number;
  errors: string[];
};


/**
 * ドラッグしているものにファイルが含まれるかどうかを判定する。
 *
 * @param event - ドラッグのイベント
 * @returns ファイルが含まれる場合は `true`
 */
const hasFiles = (event: DragEvent): boolean => event.dataTransfer?.types.includes('Files') ?? false;


/**
 * 画像の URL（絶対 URL）を返す。
 *
 * @param id - 画像ID
 * @returns 絶対 URL
 */
const getImageUrl = (id: string): string => new URL(
  getImagePath(id),
  process.env.NEXT_PUBLIC_APP_URL ?? globalThis.location.origin,
).href;


/**
 * テキストをクリップボードにコピーするボタン。コピーした結果を一定時間表示する。
 *
 * @param properties - プロパティ
 * @returns ボタン
 */
function CopyButton({
  text,
  label,
  isIconOnly = false,
  className,
}: {
  /** コピーするテキスト */
  text: string | (() => string);
  label: string;
  /** アイコンだけを表示するかどうか（ラベルはツールチップとスクリーンリーダー用に使う） */
  isIconOnly?: boolean;
  className: string;
}): JSX.Element {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);

  useEffect(() => {
    if (!result) {
      return;
    }
    const timer = setTimeout(() => setResult(null), COPY_FEEDBACK_DURATION);
    return () => clearTimeout(timer);
  }, [result]);

  const currentLabel = { copied: 'コピーしました', failed: 'コピーできませんでした', none: label }[result ?? 'none'];
  const Icon = result === 'copied' ? Check : (result === 'failed' ? CircleAlert : Copy);
  const iconColor = { copied: 'text-emerald-400', failed: 'text-red-400', none: '' }[result ?? 'none'];

  return (
    <button
      type="button"
      title={currentLabel}
      aria-label={isIconOnly ? currentLabel : undefined}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
          setResult('copied');
        } catch (e) {
          console.error('Failed to copy:', e);
          setResult('failed');
        }
      }}
      className={className}
    >
      <Icon className={`h-4 w-4 shrink-0 ${iconColor}`} aria-hidden />
      {!isIconOnly && <span aria-live="polite">{currentLabel}</span>}
    </button>
  );
}


/**
 * 画像の使用状況のバッジ。
 *
 * @param properties - プロパティ
 * @returns バッジ
 */
function UsageBadge({ image }: { image: ManagedImage }): JSX.Element {
  const baseClassName = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs whitespace-nowrap';
  switch (getImageUsageStatus(image)) {
    case 'current': {
      return (
        <span className={`${baseClassName} bg-emerald-500/15 text-emerald-300`}>
          使用中 {image.usages.length}件
        </span>
      );
    }
    case 'history': {
      return (
        <span
          className={`${baseClassName} bg-amber-500/15 text-amber-300`}
          title="記事の過去の版でのみ使用しています。公開ページの編集履歴に表示される場合があります。"
        >
          過去の版のみ
        </span>
      );
    }
    case 'unused': {
      return <span className={`${baseClassName} bg-gray-700/60 text-gray-400`}>未使用</span>;
    }
  }
}


/**
 * アップロードの結果の通知。
 *
 * @param properties - プロパティ
 * @returns 通知
 */
function UploadNotice({
  type,
  onClose,
  children,
}: {
  type: 'success' | 'error';
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm '
        + (type === 'error'
          ? 'border-red-500/40 bg-red-500/10 text-red-100'
          : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100')
      }
    >
      {type === 'error'
        ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
        : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />}
      <div className="min-w-0 flex-1 space-y-1">{children}</div>
      <button type="button" aria-label="通知を閉じる" onClick={onClose} className="text-gray-400 hover:text-white">
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}


/**
 * 詳細画面の項目。
 *
 * @param properties - プロパティ
 * @returns 項目
 */
function DetailItem({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-gray-400">{label}</dt>
      <dd className="text-sm break-all text-gray-100">{children}</dd>
    </div>
  );
}


/**
 * コピーできるテキストの欄（URL・Markdown）。
 *
 * @param properties - プロパティ
 * @returns 欄
 */
function CopyableField({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="flex gap-1">
        <input
          type="text"
          readOnly
          value={value}
          aria-label={label}
          onFocus={(event) => event.target.select()}
          className={
            'min-w-0 flex-1 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 font-mono text-xs text-gray-200 '
            + 'focus:outline-none focus:ring-2 focus:ring-emerald-500'
          }
        />
        <CopyButton
          text={value}
          label={`${label}をコピー`}
          isIconOnly
          className="shrink-0 rounded border border-gray-600 px-2 text-gray-300 hover:bg-gray-700 hover:text-white"
        />
      </div>
    </div>
  );
}


/**
 * 画像の詳細画面。画像を大きく表示し、URL のコピーや、使用している記事の確認ができる。
 *
 * @param properties - プロパティ
 * @returns 詳細画面
 */
function ImageDetailDialog({
  image,
  onRequestClose,
  onRequestDelete,
}: {
  image: ManagedImage;
  onRequestClose: () => void;
  onRequestDelete: () => void;
}): JSX.Element {
  const imagePath = getImagePath(image.id);

  return (
    <ReactModal
      isOpen={true}
      onRequestClose={onRequestClose}
      contentLabel={`画像の詳細: ${image.fileName}`}
      className={
        'fixed inset-2 flex flex-col overflow-hidden rounded-lg bg-gray-800 shadow-lg outline-none '
        + 'sm:inset-6 lg:inset-x-16 lg:inset-y-10'
      }
      overlayClassName="fixed inset-0 z-[100] bg-[rgba(55,65,81,0.8)]"
      ariaHideApp={false}
    >
      <div className="flex items-center gap-3 border-b border-gray-700 px-4 py-3">
        <ImageIcon className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
        <h2 className="min-w-0 flex-1 truncate text-lg font-bold" title={image.fileName}>{image.fileName}</h2>
        <button
          type="button"
          aria-label="画像の詳細を閉じる"
          onClick={onRequestClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-700 hover:text-white"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </div>
      <div
        className={
          'flex min-h-0 flex-1 flex-col overflow-y-auto '
          + 'md:grid md:grid-cols-[minmax(0,1fr)_22rem] md:overflow-hidden'
        }
      >
        {/* 画像（元のデータをそのまま表示する） */}
        <div
          className="flex h-[45vh] shrink-0 items-center justify-center p-4 md:h-auto md:min-h-0"
          style={CHECKERBOARD_STYLE}
        >
          <Image
            src={imagePath}
            alt={image.fileName}
            width={image.width}
            height={image.height}
            unoptimized
            draggable={false}
            className="h-auto max-h-full w-auto max-w-full object-contain"
          />
        </div>

        {/* 詳細 */}
        <div
          className={
            'flex flex-col gap-5 border-t border-gray-700 p-4 '
            + 'md:min-h-0 md:overflow-y-auto md:border-t-0 md:border-l'
          }
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <DetailItem label="形式">{formatImageType(image.mimeType)}</DetailItem>
            <DetailItem label="サイズ">{formatFileSize(image.size)}</DetailItem>
            <DetailItem label="大きさ">{image.width} × {image.height} px</DetailItem>
            <DetailItem label="アップロード日時">
              <time dateTime={image.createdAt.toISOString()}>{formatDateTime(image.createdAt)}</time>
            </DetailItem>
            <div className="col-span-2">
              <DetailItem label="アップロードした人">{image.uploaderName ?? '（不明）'}</DetailItem>
            </div>
          </dl>

          <div className="flex flex-col gap-3">
            <CopyableField label="Markdown" value={toImageMarkdown(image)} />
            <CopyableField label="URL" value={getImageUrl(image.id)} />
            <a
              href={imagePath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 self-start text-sm text-emerald-400 hover:underline"
            >
              元の画像を新しいタブで開く
              <ExternalLink className="h-4 w-4" aria-hidden />
            </a>
          </div>

          <section aria-labelledby="image-usages-heading" className="flex flex-col gap-2">
            <h3 id="image-usages-heading" className="flex items-center gap-2 text-sm font-medium text-gray-300">
              使用している記事
              <UsageBadge image={image} />
            </h3>
            {image.usages.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {image.usages.map((usage) => (
                  <li key={usage.postId}>
                    <Link
                      href={`/admin/control/posts/${usage.postId}`}
                      className={
                        'flex items-center gap-2 rounded border border-gray-700 px-3 py-2 text-sm '
                        + 'hover:border-emerald-500/50 hover:bg-gray-700/40'
                      }
                    >
                      <span className="min-w-0 flex-1 truncate" title={usage.title}>{usage.title}</span>
                      {!usage.isInLatestVersion && (
                        <span className="shrink-0 text-xs text-amber-300">過去の版のみ</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">どの記事でも使用されていません。</p>
            )}
          </section>

          <button
            type="button"
            onClick={onRequestDelete}
            className={
              'mt-auto inline-flex items-center justify-center gap-2 rounded border border-red-500/60 px-4 py-2 '
              + 'text-sm text-red-300 hover:bg-red-500/10'
            }
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            この画像を削除
          </button>
        </div>
      </div>
    </ReactModal>
  );
}


/**
 * 画像の削除モーダル。
 *
 * @param properties - プロパティ
 * @returns モーダルの要素
 */
function DeleteImageModal({
  image,
  onSubmit,
  onClose,
}: {
  image: ManagedImage;
  /** 送信処理。失敗した場合はエラーメッセージを返す */
  onSubmit: () => Promise<string | null>;
  onClose: () => void;
}): JSX.Element {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Modal
      isOpen={true}
      onRequestClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      contentLabel="画像の削除"
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (isSubmitting) {
            return;
          }
          setIsSubmitting(true);
          setError(null);
          try {
            setError(await onSubmit());
          } catch (e) {
            console.error('Failed to delete image:', e);
            setError('画像の削除に失敗しました。');
          } finally {
            setIsSubmitting(false);
          }
        }}
        className="flex flex-col gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded" style={CHECKERBOARD_STYLE}>
            <Image
              src={getImagePath(image.id)}
              alt=""
              fill
              sizes="64px"
              unoptimized={image.mimeType === 'image/gif'}
              draggable={false}
              className="object-cover"
            />
          </div>
          <p className="min-w-0 text-sm">
            <span className="block truncate font-medium" title={image.fileName}>{image.fileName}</span>
            <span className="text-gray-400">を削除します。この操作は元に戻せません。</span>
          </p>
        </div>
        {image.usages.length > 0 ? (
          <div className="flex gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 space-y-1">
              <p>
                この画像は次の記事で使用されています。削除すると、これらの記事（過去の版を含む）で画像が表示されなくなります。
              </p>
              <ul className="list-disc pl-5 text-red-200/90">
                {image.usages.map((usage) => (
                  <li key={usage.postId} className="break-all">
                    {usage.title}
                    {!usage.isInLatestVersion && '（過去の版のみ）'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">この画像はどの記事でも使用されていません。</p>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-gray-600 hover:bg-gray-500`}
            disabled={isSubmitting}
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            type="submit"
            className={`${MODAL_BUTTON_CLASS_NAME} bg-red-600 text-white hover:bg-red-700`}
            disabled={isSubmitting}
          >
            削除
          </button>
        </div>
      </form>
    </Modal>
  );
}


/**
 * 画像の一覧の1件分。
 *
 * @param properties - プロパティ
 * @returns 画像の1件分
 */
function ImageCard({
  image,
  isNew,
  onOpen,
  onDelete,
}: {
  image: ManagedImage;
  /** このページでアップロードした画像かどうか */
  isNew: boolean;
  onOpen: () => void;
  onDelete: () => void;
}): JSX.Element {
  return (
    <li
      className={
        'flex flex-col overflow-hidden rounded-lg border bg-gray-900/40 transition-colors '
        + 'focus-within:border-emerald-500/60 hover:border-emerald-500/50 '
        + (isNew ? 'border-emerald-500/60' : 'border-gray-800')
      }
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`画像「${image.fileName}」の詳細を表示`}
        className="relative block aspect-square w-full overflow-hidden focus:outline-none"
        style={CHECKERBOARD_STYLE}
      >
        <Image
          src={getImagePath(image.id)}
          alt=""
          fill
          sizes={THUMBNAIL_SIZES}
          // GIF（アニメーションの可能性がある）は最適化できないため、そのまま表示する
          unoptimized={image.mimeType === 'image/gif'}
          draggable={false}
          className="object-cover transition-transform duration-200 hover:scale-[1.03]"
        />
        {isNew && (
          <span
            className="absolute top-2 left-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white"
          >
            NEW
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="truncate text-sm text-gray-100" title={image.fileName}>{image.fileName}</p>
        <p className="text-xs text-gray-500">
          {image.width}×{image.height} · {formatFileSize(image.size)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1">
          <UsageBadge image={image} />
          <div className="flex shrink-0">
            <CopyButton
              text={toImageMarkdown(image)}
              label="Markdown をコピー"
              isIconOnly
              className={`${CARD_BUTTON_CLASS_NAME} hover:text-white`}
            />
            <button
              type="button"
              aria-label={`画像「${image.fileName}」を削除`}
              title="削除"
              onClick={onDelete}
              className={`${CARD_BUTTON_CLASS_NAME} hover:text-red-400`}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}


type ImageManagerProperties = {
  initialImages: ManagedImage[];
  onUpload: UploadImageAction<ManagedImage>;
  /** 画像を削除する（`isUsageConfirmed` は、記事で使用されていることを確認したうえで削除するかどうか） */
  onDelete: (id: string, isUsageConfirmed: boolean) => Promise<ActionResult>;
};


/**
 * 画像管理画面を生成する。アップロードされた画像の一覧を表示し、アップロード・削除ができる。
 *
 * @param properties - 初期表示する画像と、画像を操作するServer Action
 * @returns 生成した画面
 */
export default function ImageManager({ initialImages, onUpload, onDelete }: ImageManagerProperties): JSX.Element {
  const searchInputReference = useRef<HTMLInputElement>(null);
  const fileInputReference = useRef<HTMLInputElement>(null);
  const uploadKeyReference = useRef(0);
  const dragDepthReference = useRef(0);
  const [images, setImages] = useState<ManagedImage[]>(initialImages);
  const [filters, setFilters] = useState<ImageListFilters>(DEFAULT_IMAGE_FILTERS);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(null);
  const [newImageIds, setNewImageIds] = useState<ReadonlySet<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const visibleImages = useMemo(() => filterAndSortImages(images, filters), [images, filters]);
  const usageCounts = useMemo(() => countByUsage(images, filters.query), [images, filters.query]);
  const totalSize = useMemo(() => images.reduce((total, image) => total + image.size, 0), [images]);
  const isFiltered = filters.query.trim() !== '' || filters.usage !== DEFAULT_IMAGE_FILTERS.usage;
  const modalTarget = modal ? images.find((image) => image.id === modal.imageId) : undefined;
  const isUploading = uploadingFiles.length > 0;
  const hasUploadSuccess = !isUploading && (uploadSummary?.uploadedCount ?? 0) > 0;
  const hasUploadErrors = !isUploading && (uploadSummary?.errors.length ?? 0) > 0;

  /**
   * 表示条件を変更する。
   *
   * @param changes - 変更する条件
   */
  function updateFilters(changes: Partial<ImageListFilters>): void {
    setFilters((previous) => ({ ...previous, ...changes }));
  }

  /**
   * 絞り込み条件を解除する（並び順は保つ）。
   */
  function clearFilters(): void {
    updateFilters({ query: DEFAULT_IMAGE_FILTERS.query, usage: DEFAULT_IMAGE_FILTERS.usage });
  }

  /**
   * 画像をアップロードし、一覧に追加する。
   *
   * @param files - アップロードするファイル
   */
  async function uploadFiles(files: readonly File[]): Promise<void> {
    if (files.length === 0) {
      return;
    }
    const errors: string[] = [];
    const validFiles = files.filter((file) => {
      const error = validateImageFile(file);
      if (error) {
        errors.push(error);
      }
      return !error;
    });
    if (validFiles.length > MAX_IMAGE_FILES_PER_UPLOAD) {
      errors.push(`一度にアップロードできる画像は${MAX_IMAGE_FILES_PER_UPLOAD}件までです。`);
    }
    const targets = validFiles.slice(0, MAX_IMAGE_FILES_PER_UPLOAD);
    setUploadSummary(null);
    if (targets.length === 0) {
      setUploadSummary({ uploadedCount: 0, errors });
      return;
    }

    const keys = new Map(targets.map((file) => [file, ++uploadKeyReference.current]));
    setUploadingFiles((previous) => [
      ...previous,
      ...targets.map((file) => ({ key: keys.get(file) ?? 0, fileName: file.name })),
    ]);
    let uploadedCount = 0;
    await uploadImageFiles(targets, onUpload, (file, result) => {
      setUploadingFiles((previous) => previous.filter((item) => item.key !== keys.get(file)));
      if (!result.ok) {
        errors.push(result.error);
        return;
      }
      uploadedCount++;
      const image = result.data;
      setImages((previous) => [image, ...previous.filter((current) => current.id !== image.id)]);
      setNewImageIds((previous) => new Set([...previous, image.id]));
    });
    setUploadSummary({ uploadedCount, errors });
  }

  // ページのどこにでも、画像をドラッグ＆ドロップしてアップロードできるようにする
  const handleDroppedFiles = useEffectEvent((files: File[]) => uploadFiles(files));
  useEffect(() => {
    const handleDragEnter = (event: DragEvent): void => {
      if (hasFiles(event)) {
        dragDepthReference.current++;
        setIsDragging(true);
      }
    };
    const handleDragOver = (event: DragEvent): void => {
      if (hasFiles(event) && event.dataTransfer) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
      }
    };
    const handleDragLeave = (event: DragEvent): void => {
      if (hasFiles(event)) {
        dragDepthReference.current = Math.max(0, dragDepthReference.current - 1);
        if (dragDepthReference.current === 0) {
          setIsDragging(false);
        }
      }
    };
    const handleDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) {
        return;
      }
      // ブラウザでファイルが開かれないようにする
      event.preventDefault();
      dragDepthReference.current = 0;
      setIsDragging(false);
      handleDroppedFiles([...(event.dataTransfer?.files ?? [])]);
    };
    globalThis.addEventListener('dragenter', handleDragEnter);
    globalThis.addEventListener('dragover', handleDragOver);
    globalThis.addEventListener('dragleave', handleDragLeave);
    globalThis.addEventListener('drop', handleDrop);
    return () => {
      globalThis.removeEventListener('dragenter', handleDragEnter);
      globalThis.removeEventListener('dragover', handleDragOver);
      globalThis.removeEventListener('dragleave', handleDragLeave);
      globalThis.removeEventListener('drop', handleDrop);
    };
  }, []);

  const closeModal = (): void => setModal(null);
  const uploadButton = (className: string): JSX.Element => (
    <button type="button" onClick={() => fileInputReference.current?.click()} className={className}>
      <ImageUp className="h-4 w-4" aria-hidden />
      画像をアップロード
    </button>
  );

  return (
    <div className="mx-auto flex flex-col gap-6 px-4 py-12">
      {modal?.type === 'detail' && modalTarget && (
        <ImageDetailDialog
          image={modalTarget}
          onRequestClose={closeModal}
          onRequestDelete={() => setModal({ type: 'delete', imageId: modalTarget.id, fromDetail: true })}
        />
      )}

      {modal?.type === 'delete' && modalTarget && (
        <DeleteImageModal
          image={modalTarget}
          onSubmit={async () => {
            const result = await onDelete(modalTarget.id, modalTarget.usages.length > 0);
            if (!result.ok) {
              return result.error;
            }
            setImages((previous) => previous.filter((image) => image.id !== modalTarget.id));
            closeModal();
            return null;
          }}
          onClose={() => setModal(modal.fromDetail ? { type: 'detail', imageId: modalTarget.id } : null)}
        />
      )}

      <input
        ref={fileInputReference}
        type="file"
        accept={IMAGE_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          // 同じファイルを続けて選択できるよう、選択をリセットする
          event.target.value = '';
          uploadFiles(files);
        }}
      />

      {/* ドラッグ中の表示 */}
      {isDragging && (
        <div
          aria-hidden
          className={
            'pointer-events-none fixed inset-3 z-[90] flex flex-col items-center justify-center gap-3 rounded-xl '
            + 'border-4 border-dashed border-emerald-500/70 bg-gray-900/85 text-emerald-200'
          }
        >
          <ImageUp className="h-12 w-12" />
          <p className="text-lg font-medium">ドロップして画像をアップロード</p>
        </div>
      )}

      {/* ヘッダー */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/admin/control/posts"
            className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            投稿一覧
          </Link>
          <h1 className="mt-2 text-2xl">画像管理</h1>
          <p className="mt-1 text-sm text-gray-400">
            全{images.length}件の画像（合計 {formatFileSize(totalSize)}）
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          {uploadButton(PRIMARY_BUTTON_CLASS_NAME)}
          <p className="text-xs text-gray-500">
            JPEG・PNG・GIF・WebP・AVIF（{formatFileSize(MAX_IMAGE_FILE_SIZE)}まで）。ドラッグ＆ドロップでも追加できます。
          </p>
        </div>
      </div>

      {/* アップロードの状況 */}
      {(isUploading || hasUploadSuccess || hasUploadErrors) && (
        <div className="flex flex-col gap-2" aria-live="polite">
          {isUploading && (
            <div className="flex flex-col gap-1 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-3 text-sm">
              <p className="flex items-center gap-2 text-sky-200">
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                {uploadingFiles.length}件の画像をアップロード中…
              </p>
              <ul className="pl-6 text-xs text-sky-200/80">
                {uploadingFiles.map((file) => <li key={file.key} className="truncate">{file.fileName}</li>)}
              </ul>
            </div>
          )}
          {hasUploadSuccess && uploadSummary && (
            <UploadNotice type="success" onClose={() => setUploadSummary({ ...uploadSummary, uploadedCount: 0 })}>
              <p>{uploadSummary.uploadedCount}件の画像をアップロードしました。</p>
            </UploadNotice>
          )}
          {hasUploadErrors && uploadSummary && (
            <UploadNotice type="error" onClose={() => setUploadSummary({ ...uploadSummary, errors: [] })}>
              {uploadSummary.errors.map((error) => <p key={error}>{error}</p>)}
            </UploadNotice>
          )}
        </div>
      )}

      {images.length === 0 ? (
        // 画像が1件もない場合
        <div className={`${EMPTY_STATE_CLASS_NAME} gap-4 py-16`}>
          <ImageIcon className="h-10 w-10 text-gray-600" aria-hidden />
          <div className="space-y-1">
            <p className="font-medium text-gray-200">まだ画像がありません</p>
            <p className="text-sm text-gray-400">
              画像は、ここでアップロードするほか、記事の編集画面でもアップロードできます。
            </p>
          </div>
          {uploadButton(`${PRIMARY_BUTTON_CLASS_NAME} text-sm`)}
        </div>
      ) : (
        <>
          {/* 使用状況による絞り込み */}
          <div role="group" aria-label="使用状況で絞り込む" className="flex flex-wrap gap-1">
            {USAGE_FILTERS.map((filter) => {
              const isSelected = filters.usage === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => updateFilters({ usage: filter.value })}
                  className={
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors '
                    + (isSelected
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                      : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200')
                  }
                >
                  {filter.label}
                  <span
                    className={
                      'rounded-full px-1.5 text-xs tabular-nums '
                      + (isSelected ? 'bg-emerald-500/25 text-emerald-100' : 'bg-gray-800 text-gray-400')
                    }
                  >
                    {usageCounts[filter.value]}
                  </span>
                </button>
              );
            })}
          </div>

          {/* キーワード・並び順 */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500"
                aria-hidden
              />
              <input
                ref={searchInputReference}
                type="search"
                value={filters.query}
                onChange={(event) => updateFilters({ query: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && filters.query !== '') {
                    event.preventDefault();
                    updateFilters({ query: '' });
                  }
                }}
                placeholder="ファイル名・記事のタイトルで検索"
                aria-label="キーワードで検索"
                className={
                  'w-full rounded border border-gray-600 bg-gray-900 py-2 pr-10 pl-9 text-sm text-gray-200 '
                  + 'placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 '
                  + '[&::-webkit-search-cancel-button]:hidden'
                }
              />
              {filters.query !== '' && (
                <button
                  type="button"
                  aria-label="キーワードを消去"
                  onClick={() => {
                    updateFilters({ query: '' });
                    searchInputReference.current?.focus();
                  }}
                  className={
                    'absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-gray-400 hover:bg-gray-700 '
                    + 'hover:text-white'
                  }
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
            <select
              aria-label="並び順"
              value={filters.sort}
              onChange={(event) => updateFilters({ sort: event.target.value as ImageSortOrder })}
              className={
                'w-full rounded border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-gray-200 '
                + 'focus:outline-none focus:ring-2 focus:ring-emerald-500'
              }
            >
              {IMAGE_SORT_ORDERS.map((order) => (
                <option key={order.value} value={order.value}>{order.label}</option>
              ))}
            </select>
          </div>

          {/* 件数 */}
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-400" aria-live="polite">
            <span>
              {isFiltered ? `${images.length}件中 ${visibleImages.length}件を表示` : `${visibleImages.length}件`}
            </span>
            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                条件をクリア
              </button>
            )}
          </div>

          {visibleImages.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {visibleImages.map((image) => (
                <ImageCard
                  key={image.id}
                  image={image}
                  isNew={newImageIds.has(image.id)}
                  onOpen={() => setModal({ type: 'detail', imageId: image.id })}
                  onDelete={() => setModal({ type: 'delete', imageId: image.id, fromDetail: false })}
                />
              ))}
            </ul>
          ) : (
            // 条件に一致する画像がない場合
            <div className={`${EMPTY_STATE_CLASS_NAME} gap-3 py-12`}>
              <SearchX className="h-8 w-8 text-gray-600" aria-hidden />
              <p className="text-gray-300">条件に一致する画像はありません</p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                条件をクリア
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
