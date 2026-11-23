import { serializeJsonLd } from '@/utils/json-ld';

import type { JSX } from 'react';
import type { JsonLdNode } from '@/utils/json-ld';


/**
 * 検索エンジン向けの構造化データ（JSON-LD）を出力する。
 *
 * @param properties - 出力するノード（複数の場合は `@graph` にまとめる）
 * @returns `<script>` 要素
 */
export default function JsonLd({ nodes }: { nodes: JsonLdNode[] }): JSX.Element {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(nodes) }}
    />
  );
}
