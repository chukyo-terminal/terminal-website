import { cache } from 'react';

import { and, eq, gte, lt } from 'drizzle-orm';

import { publishedPostsView } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { selectPostVersions } from '@/lib/post-version-queries';
import { isPublicVersion } from '@/lib/post-versions';
import { getFiscalYearStart } from '@/utils/date';

import type { PublishedPostVersion } from '@/lib/post-versions';


/**
 * サイトのタイトル。
 */
export const SITE_TITLE = 'Terminal | 中京大学プログラミングサークル';


/**
 * 公開ページに表示する記事の概要。
 */
export type PublicPost = {
  id: number;
  slug: string;
  /** 公開ページに表示されている版のタイトル */
  title: string;
  authorName: string;
  /** 初めて公開された日時 */
  publishedAt: Date;
  /** 公開ページに表示されている版の公開日時 */
  updatedAt: Date;
};


/**
 * URL の年度とスラッグから、公開ページに表示できる記事を取得する。
 *
 * 同じリクエスト内（メタデータとページの生成など）では、結果を再利用する。
 *
 * @param year - URL の年度
 * @param slug - URL のスラッグ
 * @returns 記事。表示できる記事がない場合は `null`
 */
export const findPublicPost = cache(async (year: string, slug: string): Promise<PublicPost | null> => {
  if (!/^\d{4}$/.test(year)) {
    return null;
  }
  const yearNumber = Number(year);
  const post = await db
    .select({
      id: publishedPostsView.id,
      slug: publishedPostsView.slug,
      title: publishedPostsView.title,
      authorName: publishedPostsView.authorName,
      authorDisplayName: publishedPostsView.authorDisplayName,
      publishedAt: publishedPostsView.publishedAt,
      updatedAt: publishedPostsView.updatedAt,
    })
    .from(publishedPostsView)
    .where(and(
      eq(publishedPostsView.slug, slug),
      gte(publishedPostsView.publishedAt, getFiscalYearStart(yearNumber)),
      lt(publishedPostsView.publishedAt, getFiscalYearStart(yearNumber + 1)),
    ))
    .then((result) => result.at(0));
  if (!post?.publishedAt || !post.updatedAt) {
    return null;
  }
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    authorName: post.authorDisplayName || post.authorName,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
  };
});


/**
 * 記事の版のうち、公開ページに表示できるもの（公開済みで、非公開にしていない版）を取得する。
 *
 * @param postId - 投稿ID
 * @returns 古い順に並べた版
 */
export const findPublicVersions = cache(async (postId: number): Promise<PublishedPostVersion[]> => {
  const versions = await selectPostVersions(postId);
  return versions.filter((version) => isPublicVersion(version));
});


/**
 * 日時を日本標準時でフォーマットする。
 *
 * @param date - フォーマットする日時
 * @returns フォーマット済みの日時文字列（例: `2026/11/18 14:05`）
 */
export const formatPublicDateTime = (date: Date): string => new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
}).format(date);
