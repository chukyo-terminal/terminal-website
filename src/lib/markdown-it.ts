
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


/**
 * 外部のサイトへのリンクを、新しいタブで開くようにするプラグイン。
 *
 * @param md - プラグインを適用する markdown-it インスタンス
 */
const externalLinkPlugin = (md: MarkdownItInstance): void => {
  const defaultRender = md.renderer.rules.link_open
    ?? ((tokens, index, options, _environment, self) => self.renderToken(tokens, index, options));
  md.renderer.rules.link_open = (tokens, index, options, environment, self) => {
    const href = tokens[index].attrGet('href');
    if (typeof href === 'string' && /^https?:\/\//i.test(href)) {
      tokens[index].attrSet('target', '_blank');
      tokens[index].attrSet('rel', 'noopener noreferrer');
    }
    return defaultRender(tokens, index, options, environment, self);
  };
};


/**
 * Q&Aの回答の Markdown を HTML に変換するためのインスタンス。
 *
 * 回答は公開ページと管理画面のプレビューの両方で表示するため、HTML は使用できないようにする。
 */
export const faqMarkdownIt = new MarkdownIt({ ...markdownItOptions, html: false }).use(externalLinkPlugin);
