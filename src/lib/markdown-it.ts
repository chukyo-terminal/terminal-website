
import MarkdownIt from 'markdown-it';

import type { MarkdownItOptions, MarkdownIt as MarkdownItInstance } from 'markdown-it';


/**
 * 記事の Markdown を HTML に変換する際の共通オプション。
 */
const markdownItOptions: MarkdownItOptions = {
  html: true,
  linkify: true,
  typographer: true,
};


/**
 * 記事の Markdown を HTML に変換するためのインスタンス。
 */
export const markdownIt = new MarkdownIt(markdownItOptions);


/**
 * ブロック要素に、対応する Markdown ソースの行番号（0始まり）を `data-source-line` 属性として付与するプラグイン。
 *
 * @param md - プラグインを適用する markdown-it インスタンス
 */
const sourceLinePlugin = (md: MarkdownItInstance): void => {
  md.core.ruler.push('source_line', (state) => {
    for (const token of state.tokens) {
      if (token.block && token.map && token.nesting !== -1) {
        token.attrSet('data-source-line', String(token.map[0]));
      }
    }
  });
};


/**
 * 記事編集画面のプレビュー用インスタンス。
 *
 * 公開ページと同じ設定で変換したうえで、エディタとプレビューのスクロールを同期するためにソースの行番号を出力する。
 */
export const previewMarkdownIt = new MarkdownIt(markdownItOptions).use(sourceLinePlugin);
