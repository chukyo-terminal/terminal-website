'use client';

import { useEffect, useEffectEvent, useRef } from 'react';

import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { EditorState, Prec } from '@codemirror/state';
import {
  EditorView, crosshairCursor, drawSelection, dropCursor, highlightActiveLine, highlightActiveLineGutter,
  highlightSpecialChars, keymap, lineNumbers, placeholder, rectangularSelection,
} from '@codemirror/view';

import { editorTheme, japanesePhrases, markdownHighlightStyle } from '../_lib/editor-extensions';
import { markdownShortcutKeymap } from '../_lib/markdown-commands';

import type { JSX } from 'react';


/**
 * カーソル位置の情報。
 */
export type CursorInfo = {
  /** 行番号（1始まり） */
  line: number;
  /** 列番号（1始まり） */
  column: number;
  /** 選択中の文字数 */
  selectedLength: number;
};


type MarkdownEditorProperties = {
  /** 初期値（マウント後に変更しても反映されない） */
  initialValue: string;
  /** エディタの生成時・破棄時に呼ばれる */
  onViewChange: (view: EditorView | null) => void;
  /** 本文が変更されたときに呼ばれる */
  onChange: (value: string) => void;
  /** カーソル位置が変わったときに呼ばれる */
  onCursorChange: (cursor: CursorInfo) => void;
  /** スクロールしたときに呼ばれる（描画フレームごとに最大1回） */
  onScroll: () => void;
  className?: string;
};


/**
 * Markdown エディタ（CodeMirror）。
 *
 * @param properties - プロパティ
 * @returns エディタ
 */
export default function MarkdownEditor({
  initialValue,
  onViewChange,
  onChange,
  onCursorChange,
  onScroll,
  className,
}: MarkdownEditorProperties): JSX.Element {
  const containerReference = useRef<HTMLDivElement>(null);
  const initialValueReference = useRef(initialValue);

  const handleViewChange = useEffectEvent((view: EditorView | null) => onViewChange(view));
  const handleChange = useEffectEvent((value: string) => onChange(value));
  const handleCursorChange = useEffectEvent((cursor: CursorInfo) => onCursorChange(cursor));
  const handleScroll = useEffectEvent(() => onScroll());

  useEffect(() => {
    const container = containerReference.current;
    if (!container) {
      return;
    }

    const view = new EditorView({
      parent: container,
      state: EditorState.create({
        doc: initialValueReference.current,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightSpecialChars(),
          history(),
          drawSelection(),
          dropCursor(),
          EditorState.allowMultipleSelections.of(true),
          rectangularSelection(),
          crosshairCursor(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          search({ top: true }),
          markdown({ base: markdownLanguage, completeHTMLTags: false }),
          syntaxHighlighting(markdownHighlightStyle),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': '本文（Markdown）' }),
          placeholder('本文を Markdown で入力してください'),
          japanesePhrases,
          editorTheme,
          Prec.high(keymap.of(markdownShortcutKeymap)),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              handleChange(update.state.doc.toString());
            }
            if (update.docChanged || update.selectionSet) {
              const { main } = update.state.selection;
              const line = update.state.doc.lineAt(main.head);
              handleCursorChange({
                line: line.number,
                column: main.head - line.from + 1,
                selectedLength: main.to - main.from,
              });
            }
          }),
        ],
      }),
    });

    let frame = 0;
    const scrollListener = (): void => {
      if (frame !== 0) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        handleScroll();
      });
    };
    view.scrollDOM.addEventListener('scroll', scrollListener, { passive: true });
    handleViewChange(view);

    return () => {
      cancelAnimationFrame(frame);
      view.scrollDOM.removeEventListener('scroll', scrollListener);
      handleViewChange(null);
      view.destroy();
    };
  }, []);

  return <div ref={containerReference} className={className} />;
}
