'use client';

import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';

import DOMPurify from 'dompurify';

import { previewMarkdownIt } from '@/lib/markdown-it';
import '@/styles/markdown.css';

import { interpolateScrollTop } from '../_lib/scroll-sync';

import type { JSX, MouseEvent, Ref } from 'react';
import type { EditorScrollPosition, SourceLineAnchor } from '../_lib/scroll-sync';


/**
 * 入力が止まってからプレビューを更新するまでの時間（ms）。
 */
const RENDER_DELAY = 150;


/**
 * スクロール同期時に、対応する要素の上に空ける余白（px）。
 */
const SCROLL_MARGIN = 16;


/**
 * プレビューに表示しない要素と、その代わりに表示する名称。
 */
const UNSUPPORTED_ELEMENTS: Readonly<Record<string, string>> = {
  iframe: '埋め込みコンテンツ',
  script: 'スクリプト',
};


/**
 * Markdown をプレビュー用の HTML に変換する。
 *
 * 管理画面で他人が書いた記事を開いたときにスクリプトが実行されないよう、HTML は無害化する。
 *
 * @param markdown - Markdown
 * @returns 無害化した HTML
 */
function renderPreviewHtml(markdown: string): string {
  const html = previewMarkdownIt.render(markdown);
  // DOMParser で生成したドキュメントでは、スクリプトの実行やリソースの読み込みは行われない
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const element of parsed.body.querySelectorAll('iframe, script')) {
    const source = element.getAttribute('src');
    const placeholder = parsed.createElement('div');
    placeholder.className = 'markdown-embed-placeholder';
    placeholder.textContent = `${UNSUPPORTED_ELEMENTS[element.localName]}（プレビューでは表示されません）`
      + (source ? `: ${source}` : '');
    element.replaceWith(placeholder);
  }
  return DOMPurify.sanitize(parsed.body.innerHTML);
}


/**
 * プレビュー内の、ソースの行と表示位置の対応を収集する。
 *
 * @param container - スクロール領域
 * @param content - 本文の要素
 * @param lineCount - ソースの総行数
 * @returns ソースの行と表示位置の対応（行の昇順）
 */
function collectAnchors(container: HTMLElement, content: HTMLElement, lineCount: number): SourceLineAnchor[] {
  const origin = container.getBoundingClientRect().top - container.scrollTop;
  // 先頭はタイトルなどを含めたプレビューの最上部に対応させる
  let last: SourceLineAnchor = { line: 0, top: 0 };
  const anchors = [last];
  for (const element of content.querySelectorAll<HTMLElement>('[data-source-line]')) {
    const line = Number(element.dataset.sourceLine);
    const top = element.getBoundingClientRect().top - origin;
    if (line > last.line && top >= last.top) {
      last = { line, top };
      anchors.push(last);
    }
  }
  // 末尾は本文の最下部に対応させる
  anchors.push({
    line: Math.max(lineCount, last.line + 1),
    top: Math.max(content.getBoundingClientRect().bottom - origin, last.top),
  });
  return anchors;
}


/**
 * スクロール同期に使う表示位置のキャッシュ。
 */
type AnchorCache = {
  /** 計算時の本文の幅 */
  width: number;
  /** 計算時の本文の高さ */
  height: number;
  /** 計算時のソースの総行数 */
  lineCount: number;
  anchors: SourceLineAnchor[];
};


/**
 * 日時をフォーマットする。
 *
 * @param date - フォーマットする日時
 * @returns フォーマット済みの日時文字列
 */
const formatDate = (date: Date): string => new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
}).format(date);


/**
 * URL のフラグメントをデコードする。デコードできない場合はそのまま返す。
 *
 * @param fragment - フラグメント（`#` を除く）
 * @returns デコードしたフラグメント
 */
function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}


/**
 * プレビューの外部から呼び出せる操作。
 */
export type MarkdownPreviewHandle = {
  /** エディタのスクロール位置に対応する位置までスクロールする */
  scrollToSourceLine: (position: EditorScrollPosition) => void;
};


type MarkdownPreviewProperties = {
  ref?: Ref<MarkdownPreviewHandle>;
  title: string;
  author: string;
  publishedAt: Date | null;
  content: string;
  /** 表示中かどうか（非表示の間はプレビューを更新しない） */
  isActive: boolean;
  /** プレビューの内容を更新した後に呼ばれる */
  onRender?: () => void;
  /** 本文がダブルクリックされたときに、対応するソースの行（0始まり）を引数に呼ばれる */
  onRequestEditLine?: (line: number) => void;
  className?: string;
};


/**
 * 記事のプレビュー。公開ページと同じ見た目で表示する。
 *
 * @param properties - プロパティ
 * @returns プレビュー
 */
export default function MarkdownPreview({
  ref,
  title,
  author,
  publishedAt,
  content,
  isActive,
  onRender,
  onRequestEditLine,
  className,
}: MarkdownPreviewProperties): JSX.Element {
  const scrollContainerReference = useRef<HTMLDivElement>(null);
  const contentReference = useRef<HTMLDivElement>(null);
  const renderedContentReference = useRef<string | null>(null);
  const anchorCacheReference = useRef<AnchorCache | null>(null);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive || renderedContentReference.current === content) {
      return;
    }
    const timer = setTimeout(() => {
      renderedContentReference.current = content;
      setHtml(renderPreviewHtml(content));
    }, renderedContentReference.current === null ? 0 : RENDER_DELAY);
    return () => clearTimeout(timer);
  }, [content, isActive]);

  const handleRender = useEffectEvent(() => onRender?.());

  useLayoutEffect(() => {
    anchorCacheReference.current = null;
    if (html !== null) {
      handleRender();
    }
  }, [html]);

  useImperativeHandle(ref, () => ({
    scrollToSourceLine(position) {
      const container = scrollContainerReference.current;
      if (!container || container.clientHeight === 0) {
        return;
      }
      if (position.isAtTop) {
        container.scrollTop = 0;
        return;
      }
      if (position.isAtBottom) {
        container.scrollTop = container.scrollHeight;
        return;
      }
      const contentElement = contentReference.current;
      if (!contentElement) {
        return;
      }
      // 画像の読み込みなどで本文の大きさが変わった場合は、表示位置を再計算する
      let cache = anchorCacheReference.current;
      if (
        !cache
        || cache.width !== contentElement.offsetWidth
        || cache.height !== contentElement.offsetHeight
        || cache.lineCount !== position.lineCount
      ) {
        cache = {
          width: contentElement.offsetWidth,
          height: contentElement.offsetHeight,
          lineCount: position.lineCount,
          anchors: collectAnchors(container, contentElement, position.lineCount),
        };
        anchorCacheReference.current = cache;
      }
      container.scrollTop = Math.max(0, interpolateScrollTop(cache.anchors, position.line) - SCROLL_MARGIN);
    },
  }), []);

  // プレビュー内のリンクで編集画面から移動してしまわないよう、別のタブで開く
  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!(event.target instanceof Element)) {
      return;
    }
    const anchor = event.target.closest('a');
    const href = anchor?.getAttribute('href');
    if (!anchor || !href) {
      return;
    }
    event.preventDefault();
    if (href.startsWith('#')) {
      contentReference.current?.querySelector(`#${CSS.escape(decodeFragment(href.slice(1)))}`)?.scrollIntoView();
      return;
    }
    globalThis.open(anchor.href, '_blank', 'noopener,noreferrer');
  };

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!onRequestEditLine || !(event.target instanceof Element)) {
      return;
    }
    const element = event.target.closest<HTMLElement>('[data-source-line]');
    if (element) {
      onRequestEditLine(Number(element.dataset.sourceLine));
    }
  };

  let body: JSX.Element;
  if (html === null) {
    body = <p className="text-gray-500">プレビューを生成しています…</p>;
  } else if (content.trim() === '') {
    body = <p className="text-gray-500">本文が入力されていません。</p>;
  } else {
    body = (
      <div ref={contentReference} className="markdown-body text-gray-200" dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  return (
    <div
      ref={scrollContainerReference}
      className={className}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <article className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <h1 className={`text-4xl font-bold break-words ${title.trim() ? 'text-emerald-400' : 'text-gray-600'}`}>
            {title.trim() || 'タイトル未設定'}
          </h1>
          <div className="shrink-0 text-sm text-gray-400 sm:ml-4">
            <p className="mb-1">著者: {author}</p>
            <p>
              投稿日: {publishedAt ? <time dateTime={publishedAt.toISOString()}>{formatDate(publishedAt)}</time> : '未公開'}
            </p>
          </div>
        </header>
        <div className="h-1 w-20 rounded bg-emerald-400" />
        {body}
      </article>
    </div>
  );
}
