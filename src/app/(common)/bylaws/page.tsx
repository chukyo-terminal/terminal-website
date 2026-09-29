import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import { Fragment } from 'react';
import { XMLParser } from 'fast-xml-parser';

import { KleeOne } from '@/styles/font';

import type { Metadata } from 'next';
import type { JSX } from 'react';

interface LawParagraph {
  ParagraphNum: string;
  ParagraphSentence: {
    Sentence: string | string[];
  };
  Item?: {
    ItemTitle: string;
    ItemSentence: {
      Sentence: string | string[];
    } | {
      Column: {
        Sentence: string;
      }[];
    };
    Subitem1?: {
      Subitem1Title: string;
      Subitem1Sentence: {
        Sentence: string | string[];
      };
    }[];
  }[];
}

interface LawXml {
  Law: {
    LawNum: string;
    LawBody: {
      LawTitle: string;
      MainProvision: {
        Chapter: {
          ChapterTitle: string;
          Article: {
            ArticleCaption: string;
            ArticleTitle: string;
            Paragraph: LawParagraph | LawParagraph[];
          }[];
        }[];
      };
      SupplProvision: {
        SupplProvisionLabel: string;
        Paragraph: LawParagraph[];
      };
    };
  };
}

export const metadata: Metadata = {
  title: '中京大学プログラミングサークルTerminal会則',
  description: '中京大学プログラミングサークルTerminal (CuT) の会則を掲載しています。',
};

export default async function BylawsPage(): Promise<JSX.Element> {
  const buf = await readFile('public/bylaws_r8_01_20260925.xml');
  const parser = new XMLParser();
  const xml: LawXml = parser.parse(buf.toString());
  const law = xml.Law;
  return (
    <div className="space-y-8 z-50 pt-20">
      <article className={KleeOne.className}>
        <p className="text-right">{law.LawNum}</p>
        <h1 className="text-2xl font-extrabold"> {law.LawBody.LawTitle}</h1>
        {/* eslint-disable-next-line no-irregular-whitespace */}
        <p className="text-right">最終施行日　令和8年9月25日</p>
        <section>
          {law.LawBody.MainProvision.Chapter.map((chapter, index_c) => (
            <section key={`chapter-${index_c}`} className="my-4">
              <h2 className="mb-2 text-xl font-extrabold">{chapter.ChapterTitle}</h2>
              {chapter.Article.map((article, index_a) => (
                <section key={`article-${index_a}`} className="my-2">
                  <p className="before:content-['　'] italic">{article.ArticleCaption}</p>
                  {(Array.isArray(article.Paragraph)
                    ? article.Paragraph : [article.Paragraph]
                  ).map((paragraph, index_p) => (
                    <section
                      key={`article-${index_a}-${index_p}`}
                      style={{
                        marginLeft: (() => {
                          if (index_p === 0) {
                            return '0';
                          }
                          let depth = 2 + article.ArticleTitle.length - 3; // 3は「第◯条」
                          // 第十項以降は前の項と文頭を揃えるため1字分戻す
                          if (index_p > 8) {
                            depth -= 1;
                          }
                          return `${depth}em`;
                        })(),
                      }}
                    >
                      <p key={`article-${index_a}-${index_p}`}>
                        <span className="font-bold">
                          {index_p === 0 ? article.ArticleTitle : paragraph.ParagraphNum}
                          {/* eslint-disable-next-line no-irregular-whitespace */}
                        </span>　{(Array.isArray(paragraph.ParagraphSentence.Sentence)
                          ? paragraph.ParagraphSentence.Sentence
                          : [paragraph.ParagraphSentence.Sentence]
                        ).map((sentence, index_s) => (
                          <span key={`article-${index_a}-${index_p}-${index_s}`}>{sentence}</span>
                        ))}
                      </p>
                      {paragraph.Item && (
                        <ul style={{ marginLeft: (() => {
                          let depth = 2;
                          if (index_p === 0) {
                            depth += 2 + article.ArticleTitle.length - 3; // 3は「第◯条」
                          }
                          return `${depth}em`;
                        })() }}>
                          {/* eslint-disable-next-line unicorn/prevent-abbreviations */}
                          {paragraph.Item.map((item, index_i) => (
                            <li key={`article-${index_a}-${index_p}-${index_i}`}>
                              {/* eslint-disable-next-line no-irregular-whitespace */}
                              <span className="font-semibold">{item.ItemTitle}</span>　{
                                (Object.hasOwn(item.ItemSentence, 'Sentence') ? (() => {
                                  const itemSentence = item.ItemSentence as { Sentence: string | string[] };
                                  return (Array.isArray(itemSentence.Sentence)
                                    ? itemSentence.Sentence
                                    : [itemSentence.Sentence]
                                  ).map((sentence, index_s) => (
                                    <span key={`article-${index_a}-${index_p}-${index_i}-${index_s}`}>{sentence}</span>
                                  ));
                                })() : (() => {
                                  const itemSentence = item.ItemSentence as { Column: { Sentence: string }[] };
                                  return itemSentence.Column.map((column, index_c) => (
                                    <Fragment key={`article-${index_a}-${index_p}-${index_i}-${index_c}`}>
                                      {index_c > 0 ? '　' : ''}
                                      <span>{column.Sentence}</span>
                                    </Fragment>
                                  ));
                                })())
                              }
                              {item.Subitem1 && (
                                <ul>
                                  {item.Subitem1.map((subitem1, index_s) => (
                                    <li key={`article-${index_a}-${index_p}-${index_i}-${index_s}`} className="ml-8">
                                      {/* eslint-disable-next-line no-irregular-whitespace */}
                                      <span className="font-semibold">{subitem1.Subitem1Title}</span>　{
                                        (Array.isArray(subitem1.Subitem1Sentence.Sentence)
                                          ? subitem1.Subitem1Sentence.Sentence
                                          : [subitem1.Subitem1Sentence.Sentence]
                                        ).map((sentence, index_s) => (
                                          <span
                                            key={`article-${index_a}-${index_p}-${index_i}-${index_s}`}
                                          >{sentence}</span>
                                        ))
                                      }
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  ))
                  }
                </section>
              ))}
            </section>
          ))}
        </section>
        <section>
          <h2 className="mb-2 text-xl font-extrabold">{law.LawBody.SupplProvision.SupplProvisionLabel}</h2>
          {law.LawBody.SupplProvision.Paragraph.map((paragraph, index_p) => (
            <section key={`suppl-${index_p}`}>
              <p key={`suppl-${index_p}`}>
                <span className="font-semibold">
                  {paragraph.ParagraphNum}
                  {/* eslint-disable-next-line no-irregular-whitespace */}
                </span>　{(Array.isArray(paragraph.ParagraphSentence.Sentence)
                  ? paragraph.ParagraphSentence.Sentence
                  : [paragraph.ParagraphSentence.Sentence]
                ).map((sentence, index_s) => (
                  <span key={`suppl-${index_p}-${index_s}`}>{sentence}</span>
                ))}
              </p>
              {paragraph.Item && (
                <ul>
                  {/* eslint-disable-next-line unicorn/prevent-abbreviations */}
                  {paragraph.Item.map((item, index_i) => (
                    <li key={`suppl-${index_p}-${index_i}`}>
                      {/* eslint-disable-next-line no-irregular-whitespace */}
                      <span className="font-semibold">{item.ItemTitle}</span>　{
                        (Object.hasOwn(item.ItemSentence, 'Sentence') ? (() => {
                          const itemSentence = item.ItemSentence as { Sentence: string | string[] };
                          return (Array.isArray(itemSentence.Sentence)
                            ? itemSentence.Sentence
                            : [itemSentence.Sentence]
                          ).map((sentence, index_s) => (
                            <span key={`suppl-${index_p}-${index_i}-${index_s}`}>{sentence}</span>
                          ));
                        })() : (() => {
                          const itemSentence = item.ItemSentence as { Column: { Sentence: string }[] };
                          return itemSentence.Column.map((column, index_c) => (
                            <Fragment key={`suppl-${index_p}-${index_i}-${index_c}`}>
                              {index_c > 0 ? '　' : ''}
                              <span>{column.Sentence}</span>
                            </Fragment>
                          ));
                        })())
                      }
                      {item.Subitem1 && (
                        <ul>
                          {item.Subitem1.map((subitem1, index_s) => (
                            <li key={`suppl-${index_p}-${index_i}-${index_s}`}>
                              {/* eslint-disable-next-line no-irregular-whitespace */}
                              <span>{subitem1.Subitem1Title}</span>　{
                                (Array.isArray(subitem1.Subitem1Sentence.Sentence)
                                  ? subitem1.Subitem1Sentence.Sentence
                                  : [subitem1.Subitem1Sentence.Sentence]
                                ).map((sentence, index_s) => (
                                  <span
                                    key={`suppl-${index_p}-${index_i}-${index_s}-${index_s}`}
                                  >{sentence}</span>
                                ))
                              }
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </section>
      </article>
      <div>
        <p>
          XML形式の会則ファイルは
          <Link href="/bylaws_r8_01_20260925.xml" target="_blank" className="text-blue-400 hover:underline">こちら</Link>
          からダウンロードできます。形式は
          <Link
            href="https://laws.e-gov.go.jp/docs/law-data-basic/419a603-xml-schema-for-japanese-law/"
            target="_blank"
            className="text-blue-400 hover:underline"
          >法令標準XMLスキーマ</Link>
          に準拠しています。
        </p>
        <p>
          本会則に関するお問い合わせは、本サイトの
          <Link href="/contact" target="_blank" className="text-blue-400 hover:underline">お問い合わせフォーム</Link>
          からお願いいたします。
        </p>
      </div>
    </div>
  );
}
