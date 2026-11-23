import Link from 'next/link';

import { asc, eq } from 'drizzle-orm';
import { ChevronDown, Code, ExternalLink, Mail, MessageCircleQuestionMark } from 'lucide-react';

import JsonLd from '@/components/elements/json-ld';
import { faqCategoriesTable, faqsTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { faqMarkdownIt } from '@/lib/markdown-it';
import { toBreadcrumbList, toFaqPage } from '@/utils/json-ld';
import { getSiteUrl } from '@/utils/site-url';
import '@/styles/markdown.css';

import type { JSX } from 'react';
import type { Metadata } from 'next';


export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  title: 'Q&A | Terminal',
  description:
    '中京大学プログラミングサークルTerminalへの参加を検討している方に向けて、入会や活動、会費などについてのよくある質問をまとめています。',
};


/**
 * 公開ページに表示する分類。
 */
type PublicFaqCategory = {
  id: number;
  title: string;
  faqs: { id: number; question: string; answerHtml: string }[];
};


/**
 * 公開中のQ&Aを、分類ごとにまとめて取得する。
 *
 * 回答は、ページへの表示と構造化データの両方に使うため、ここで一度だけ HTML に変換する。
 *
 * @returns 表示順に並べた分類（公開中のQ&Aがない分類は含まない）
 */
async function selectPublicFaqCategories(): Promise<PublicFaqCategory[]> {
  const rows = await db
    .select({
      categoryId: faqCategoriesTable.id,
      categoryTitle: faqCategoriesTable.title,
      id: faqsTable.id,
      question: faqsTable.question,
      answer: faqsTable.answer,
    })
    .from(faqsTable)
    .innerJoin(faqCategoriesTable, eq(faqsTable.categoryId, faqCategoriesTable.id))
    .where(eq(faqsTable.isPrivate, false))
    .orderBy(
      asc(faqCategoriesTable.sortOrder),
      asc(faqCategoriesTable.id),
      asc(faqsTable.sortOrder),
      asc(faqsTable.id),
    );

  const categories: PublicFaqCategory[] = [];
  for (const row of rows) {
    let category = categories.at(-1);
    if (category?.id !== row.categoryId) {
      category = { id: row.categoryId, title: row.categoryTitle, faqs: [] };
      categories.push(category);
    }
    category.faqs.push({ id: row.id, question: row.question, answerHtml: faqMarkdownIt.render(row.answer) });
  }
  return categories;
}


/**
 * 参加を検討している方に向けた、よくある質問（Q&A）のページを構成する。
 *
 * @returns 生成したページ
 */
export default async function Faq(): Promise<JSX.Element> {
  const categories = await selectPublicFaqCategories();
  const siteUrl = getSiteUrl();
  const faqs = categories.flatMap((category) => category.faqs);

  return (
    <div className="space-y-12 z-50 pt-20">
      {siteUrl && (
        <JsonLd
          nodes={[
            // 質問が一つもない FAQPage は無効なため、掲載中のQ&Aがある場合だけ出力する
            ...(faqs.length > 0
              ? [toFaqPage(siteUrl, {
                path: '/faq',
                faqs: faqs.map((faq) => ({
                  fragment: `faq-${faq.id}`,
                  question: faq.question,
                  answerHtml: faq.answerHtml,
                })),
              })]
              : []),
            toBreadcrumbList(siteUrl, [{ name: 'Q&A', path: '/faq' }]),
          ]}
        />
      )}
      <div className="space-y-4">
        <h1 className="text-4xl font-bold text-emerald-400 flex items-center">
          <Code className="mr-2 h-8 w-8" />
          Q&A
        </h1>
        <div className="h-1 w-20 bg-emerald-400 rounded"></div>
        <p className="text-gray-300 leading-relaxed">
          Terminalへの参加を検討している方に向けて、入会や活動などについてのよくある質問をまとめました。
        </p>
      </div>

      {categories.length === 0 && (
        <div
          className={
            'flex flex-col items-center gap-3 rounded-lg border border-dashed border-gray-700 px-6 py-12 '
            + 'text-center text-gray-400'
          }
        >
          <MessageCircleQuestionMark className="h-10 w-10 text-gray-600" aria-hidden />
          <p>現在、掲載しているQ&Aはありません。</p>
        </div>
      )}

      {categories.map((category) => (
        <section key={category.id} aria-labelledby={`faq-category-${category.id}`} className="space-y-4">
          <h2 id={`faq-category-${category.id}`} className="text-2xl font-bold">{category.title}</h2>
          <div className="space-y-3">
            {category.faqs.map((faq) => (
              <details
                key={faq.id}
                id={`faq-${faq.id}`}
                className={
                  'group scroll-mt-24 rounded-lg border border-gray-700 bg-gray-800/60 transition-colors '
                  + 'open:border-emerald-500/60'
                }
              >
                <summary
                  className={
                    'flex cursor-pointer list-none items-start gap-3 rounded-lg p-4 md:p-5 hover:bg-gray-800 '
                    + '[&::-webkit-details-marker]:hidden'
                  }
                >
                  <span className="font-bold text-emerald-400" aria-hidden>Q.</span>
                  <span className="flex-1 font-semibold">{faq.question}</span>
                  <ChevronDown
                    className="mt-0.5 h-5 w-5 shrink-0 text-gray-400 transition-transform group-open:rotate-180"
                    aria-hidden
                  />
                </summary>
                <div className="flex gap-3 border-t border-gray-700 p-4 md:p-5">
                  <span className="font-bold text-gray-400" aria-hidden>A.</span>
                  <div
                    className="markdown-body min-w-0 flex-1 text-gray-300"
                    dangerouslySetInnerHTML={{ __html: faq.answerHtml }}
                  />
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}

      <section className="space-y-4 rounded-lg border border-gray-700 bg-gray-800 p-6 shadow-lg">
        <div className="flex items-center gap-3">
          <Mail className="h-6 w-6 text-emerald-400" aria-hidden />
          <h2 className="text-xl font-bold">その他のご質問</h2>
        </div>
        <p className="text-gray-300">
          ここに掲載していないご質問や、入会のご希望は、お問い合わせフォームからお気軽にご連絡ください。
        </p>
        <Link
          href="/contact"
          target="_blank"
          className={
            'inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 font-medium text-white '
            + 'transition-colors duration-200 hover:bg-emerald-700'
          }
        >
          お問い合わせフォームを開く
          <ExternalLink className="ml-2 h-4 w-4" aria-hidden />
        </Link>
      </section>
    </div>
  );
}
