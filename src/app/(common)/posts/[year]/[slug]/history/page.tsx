import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowLeft, GitCompareArrows } from 'lucide-react';

import { LineChangeStats } from '@/components/elements/text-diff';
import { countLineChanges, diffLines } from '@/utils/diff';
import { getVersionLabel } from '@/utils/post-versions';

import { SITE_TITLE, findPublicPost, findPublicVersions, formatPublicDateTime } from '../_lib/public-post';

import type { JSX } from 'react';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';


type PageProperties = {
  params: Promise<{ year: string; slug: string }>;
};


export async function generateMetadata({ params }: PageProperties): Promise<Metadata> {
  const { year, slug } = await params;
  const post = await findPublicPost(year, slug);
  return {
    title: post ? `編集履歴: ${post.title} | ${SITE_TITLE}` : `編集履歴 | ${SITE_TITLE}`,
    // 過去の版は検索結果に表示させない
    robots: { index: false },
  };
}


/**
 * 記事の編集履歴（公開されている版の一覧）を表示する。
 *
 * @param properties - プロパティ
 * @returns 編集履歴のページ
 */
export default async function PostHistory({ params }: PageProperties): Promise<JSX.Element> {
  const { year, slug } = await params;
  const post = await findPublicPost(year, slug);
  if (!post) {
    notFound();
  }
  const versions = await findPublicVersions(post.id);
  const postPath = `/posts/${year}/${slug}`;
  // 新しい順に並べ、それぞれ1つ前の（表示できる）版との差分を計算する
  const entries = versions
    .map((version, index) => {
      const previous = index > 0 ? versions[index - 1] : undefined;
      return {
        version,
        isTitleChanged: previous !== undefined && previous.title !== version.title,
        stats: previous ? countLineChanges(diffLines(previous.content, version.content)) : null,
      };
    })
    .toReversed();

  return (
    <div className="space-y-8 pt-20">
      <div className="space-y-3">
        <Link
          href={postPath}
          className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          記事に戻る
        </Link>
        <h1 className="text-3xl font-bold text-emerald-400">編集履歴</h1>
        <p className="text-gray-300">
          「<Link href={postPath} className="text-emerald-300 hover:underline">{post.title}</Link>」の、これまでに公開された版の一覧です。
        </p>
      </div>

      <ol className="space-y-3">
        {entries.map(({ version, isTitleChanged, stats }, index) => {
          const versionPath = `${postPath}/history/${version.number}`;
          const isLatest = index === 0;
          return (
            <li key={version.identifier} className="rounded-lg border border-gray-700 bg-gray-800/40 p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Link href={versionPath} className="text-lg font-semibold text-emerald-300 hover:underline">
                  {getVersionLabel(version)}
                </Link>
                {isLatest && (
                  <span className="rounded-full border border-emerald-500/60 px-2 py-0.5 text-xs text-emerald-300">
                    最新
                  </span>
                )}
                <time dateTime={version.publishedAt.toISOString()} className="text-sm text-gray-400 sm:ml-auto">
                  {formatPublicDateTime(version.publishedAt)} 公開
                </time>
              </div>
              {isTitleChanged && (
                <p className="mt-2 text-sm text-gray-300">
                  タイトルを「{version.title}」に変更
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {stats
                  ? <LineChangeStats added={stats.added} removed={stats.removed} />
                  : <span className="text-xs text-gray-400">最初に公開された版</span>}
                <div className="ml-auto flex gap-4">
                  <Link href={versionPath} className="text-emerald-400 hover:underline">
                    この版を表示
                  </Link>
                  {stats && (
                    <Link
                      href={`${versionPath}?view=diff`}
                      className="inline-flex items-center gap-1 text-emerald-400 hover:underline"
                    >
                      <GitCompareArrows className="h-4 w-4" aria-hidden />
                      変更点
                    </Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
