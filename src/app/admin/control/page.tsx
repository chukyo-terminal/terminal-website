import type { JSX } from 'react';

/**
 * サイト管理ページを生成する。
 *
 * @returns 生成されたサイト管理ページの要素
 */
export default function ControlPage(): JSX.Element {
  return (
    <div className="mx-auto px-4 py-8">
      <h1 className="md:mt-8 text-2xl font-bold mb-4">サイト管理</h1>
    </div>
  );
}
