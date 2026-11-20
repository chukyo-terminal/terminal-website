import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, ChevronLeft, ChevronRight, FileText, GitCompareArrows, History } from 'lucide-react';

import { FieldDiff, LineChangeStats, TextDiff } from '@/components/elements/text-diff';
import { countLineChanges, diffLines } from '@/utils/diff';
import { markdownIt } from '@/lib/markdown-it';
import { getVersionLabel } from '@/utils/post-versions';
import '@/styles/markdown.css';
import '../../styles.css';

import { SITE_TITLE, findPublicPost, findPublicVersions, formatPublicDateTime } from '../../_lib/public-post';

import type { JSX } from 'react';
import type { Metadata } from 'next';
import type { PublicPost } from '../../_lib/public-post';
import type { PublishedPostVersion } from '@/utils/post-versions';

export const dynamic = 'force-dynamic';


type PageProperties = {
  params: Promise<{ year: string; slug: string; version: string }>;
  searchParams: Promise<{ view?: string | string[] }>;
};


/**
 * URL で指定された版と、その前後の（表示できる）版を取得する。
 *
 * @param year - URL の年度
 * @param slug - URL のスラッグ
 * @param versionParameter - URL の版番号
 * @returns 記事と版。表示できない場合は `null`
 */
async function findVersion(year: string, slug: string, versionParameter: string): Promise<{
  post: PublicPost;
  version: PublishedPostVersion;
  previous: PublishedPostVersion | undefined;
  next: PublishedPostVersion | undefined;
} | null> {
  if (!/^\d+$/.test(versionParameter)) {
    return null;
  }
  const post = await findPublicPost(year, slug);
  if (!post) {
    return null;
  }
  const versions = await findPublicVersions(post.id);
  const index = versions.findIndex((version) => version.number === Number(versionParameter));
  if (index === -1) {
    return null;
  }
  return {
    post,
    version: versions[index],
    previous: index > 0 ? versions[index - 1] : undefined,
    next: versions[index + 1],
  };
}


export async function generateMetadata({ params }: PageProperties): Promise<Metadata> {
  const { year, slug, version: versionParameter } = await params;
  const found = await findVersion(year, slug, versionParameter);
  return {
    title: found
      ? `${getVersionLabel(found.version)}: ${found.version.title} | 編集履歴 | ${SITE_TITLE}`
      : `編集履歴 | ${SITE_TITLE}`,
    // 過去の版は検索結果に表示させない
    robots: { index: false },
  };
}


/**
 * 表示の切り替えタブの共通クラス。
 */
const TAB_CLASS_NAME = 'inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors';


/**
 * 表示の切り替えタブの、選択中・未選択の配色。
 */
const TAB_STATE_CLASS_NAMES = {
  active: 'border-emerald-400 text-emerald-300',
  inactive: 'border-transparent text-gray-400 hover:text-gray-200',
} as const;


/**
 * 記事の過去の版を表示する。本文と、1つ前の（表示できる）版からの変更点を切り替えて表示できる。
 *
 * @param properties - プロパティ
 * @returns 版のページ
 */
export default async function PostVersionPage({ params, searchParams }: PageProperties): Promise<JSX.Element> {
  const { year, slug, version: versionParameter } = await params;
  const found = await findVersion(year, slug, versionParameter);
  if (!found) {
    notFound();
  }
  const { post, version, previous, next } = found;
  const { view } = await searchParams;
  const isDiffView = view === 'diff' && previous !== undefined;
  const postPath = `/posts/${year}/${slug}`;
  const historyPath = `${postPath}/history`;
  const versionPath = `${historyPath}/${version.number}`;
  const isLatest = next === undefined;
  const stats = previous ? countLineChanges(diffLines(previous.content, version.content)) : null;

  return (
    <div className="space-y-8 pt-20">
      {/* パンくず */}
      <nav aria-label="パンくずリスト" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-400">
        <Link href={postPath} className="inline-flex items-center gap-1 hover:text-emerald-400">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          記事に戻る
        </Link>
        <Link href={historyPath} className="inline-flex items-center gap-1 hover:text-emerald-400">
          <History className="h-4 w-4" aria-hidden />
          編集履歴
        </Link>
      </nav>

      {/* 版の情報 */}
      <div
        className={
          'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-sm '
          + (isLatest
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
            : 'border-amber-500/40 bg-amber-500/10 text-amber-100')
        }
      >
        <p>
          <span className="font-semibold">{getVersionLabel(version)}</span>
          （<time dateTime={version.publishedAt.toISOString()}>{formatPublicDateTime(version.publishedAt)}</time> 公開）
          {isLatest
            ? 'は、現在公開されている最新の版です。'
            : 'は過去の版です。最新の内容は記事のページをご覧ください。'}
        </p>
        {!isLatest && (
          <Link href={postPath} className="font-medium underline hover:no-underline sm:ml-auto">
            最新の版を読む
          </Link>
        )}
      </div>

      {/* 表示の切り替え */}
      <div className="flex border-b border-gray-700" role="navigation" aria-label="表示の切り替え">
        <Link
          href={versionPath}
          aria-current={isDiffView ? undefined : 'page'}
          className={`${TAB_CLASS_NAME} ${TAB_STATE_CLASS_NAMES[isDiffView ? 'inactive' : 'active']}`}
        >
          <FileText className="h-4 w-4" aria-hidden />
          本文
        </Link>
        {previous ? (
          <Link
            href={`${versionPath}?view=diff`}
            aria-current={isDiffView ? 'page' : undefined}
            className={`${TAB_CLASS_NAME} ${TAB_STATE_CLASS_NAMES[isDiffView ? 'active' : 'inactive']}`}
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden />
            変更点
            {stats && <LineChangeStats added={stats.added} removed={stats.removed} />}
          </Link>
        ) : (
          <span
            className={`${TAB_CLASS_NAME} cursor-not-allowed border-transparent text-gray-600`}
            title="最初に公開された版のため、変更点はありません"
          >
            <GitCompareArrows className="h-4 w-4" aria-hidden />
            変更点
          </span>
        )}
      </div>

      {isDiffView && previous ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            {getVersionLabel(previous)}（{formatPublicDateTime(previous.publishedAt)}）からの変更点
          </p>
          <FieldDiff label="タイトル" oldValue={previous.title} newValue={version.title} />
          <FieldDiff label="説明" oldValue={previous.description} newValue={version.description} />
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-gray-400">本文</p>
            <TextDiff oldText={previous.content} newText={version.content} />
          </div>
        </div>
      ) : (
        <article className="space-y-8">
          <div className="flex justify-between items-start">
            <h1 className="text-4xl font-bold text-emerald-400">{version.title}</h1>
            <div className="text-sm text-gray-400 ml-4 shrink-0">
              <p className="mt-0! mb-1!">著者: {post.authorName}</p>
              <p className="my-0!">
                投稿日: <time dateTime={post.publishedAt.toISOString()}>{formatPublicDateTime(post.publishedAt)}</time>
              </p>
            </div>
          </div>
          <div className="h-1 w-20 bg-emerald-400 rounded"></div>
          <div className="text-gray-200">
            <div className="markdown-body" dangerouslySetInnerHTML={{ __html: markdownIt.render(version.content) }} />
          </div>
        </article>
      )}

      {/* 前後の版 */}
      <nav aria-label="前後の版" className="flex justify-between gap-4 border-t border-gray-700 pt-6 text-sm">
        {previous ? (
          <Link
            href={`${historyPath}/${previous.number}${isDiffView ? '?view=diff' : ''}`}
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {getVersionLabel(previous)}
          </Link>
        ) : <span />}
        {next ? (
          <Link
            href={`${historyPath}/${next.number}${isDiffView ? '?view=diff' : ''}`}
            className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
          >
            {getVersionLabel(next)}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : <span />}
      </nav>
    </div>
  );
}
