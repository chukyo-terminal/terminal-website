'use client';

import Modal from '@/components/elements/modal';

import {
  EDITING_TIPS, MARKDOWN_SYNTAX_ITEMS, SHORTCUT_HELP_ITEMS, formatShortcut, useIsApplePlatform,
} from '../_lib/shortcuts';

import type { JSX } from 'react';


/**
 * キーボードショートカットと Markdown の書き方の一覧を表示するモーダル。
 *
 * @param properties - プロパティ
 * @returns モーダル
 */
export default function ShortcutHelpModal({
  isOpen,
  onRequestClose,
}: {
  isOpen: boolean;
  onRequestClose: () => void;
}): JSX.Element {
  const isApple = useIsApplePlatform();

  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose} contentLabel="ショートカット・使い方">
      <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1 text-sm">
        <section>
          <h3 className="mb-1 font-bold text-emerald-400">キーボードショートカット</h3>
          <table className="w-full">
            <tbody>
              {SHORTCUT_HELP_ITEMS.map((item) => (
                <tr key={item.key} className="border-b border-gray-700 last:border-0">
                  <td className="py-1.5 pr-4 text-gray-300">{item.description}</td>
                  <td className="py-1.5 text-right">
                    <kbd className="rounded border border-gray-600 bg-gray-900 px-1.5 py-0.5 font-mono text-xs">
                      {formatShortcut(item.key, isApple)}
                    </kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-emerald-400">Markdown の書き方</h3>
          <table className="w-full">
            <tbody>
              {MARKDOWN_SYNTAX_ITEMS.map((item) => (
                <tr key={item.syntax} className="border-b border-gray-700 last:border-0">
                  <td className="py-1.5 pr-4">
                    <code className="font-mono text-xs text-amber-200">{item.syntax}</code>
                  </td>
                  <td className="py-1.5 text-gray-300">{item.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3 className="mb-1 font-bold text-emerald-400">便利な機能</h3>
          <ul className="list-disc space-y-1 pl-5 text-gray-300">
            {EDITING_TIPS.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
        </section>
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onRequestClose} className="rounded bg-gray-600 px-4 py-2 hover:bg-gray-500">
          閉じる
        </button>
      </div>
    </Modal>
  );
}
