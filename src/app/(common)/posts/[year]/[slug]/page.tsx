import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { and, count, eq, gte, isNotNull, lt } from 'drizzle-orm';
import { History } from 'lucide-react';

import PostFeedback from './_components/post-feedback';
import JsonLd from '@/components/elements/json-ld';
import { postCommentsTable, postContentsTable, postRatingsTable, publishedPostsView } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { extractImageSources, markdownIt } from '@/lib/markdown-it';
import {
  CommentFormSchema, POST_FEEDBACK_TURNSTILE_ACTION, toPostFeedbackTurnstileCData, toPublicComments,
} from '@/utils/post-feedback';
import {
  countRecentVisitorComments, findReplyTarget, isPublicPost, selectComments, selectRatingSummary, selectVisitorRating,
} from '@/utils/post-feedback-queries';
import { verifyNonInteractiveTurnstileToken } from '@/utils/turnstile';
import { getOrCreateVisitorId, getVisitorId } from '@/utils/visitor';
import { getFiscalYearStart } from '@/utils/date';
import { toBlogPosting, toBreadcrumbList } from '@/utils/json-ld';
import { getSiteUrl } from '@/utils/site-url';
import '@/styles/markdown.css';
import './styles.css';

import type { JSX } from 'react';
import type { CommentFormValues, CommentPostResult, RatingState, RatingValue } from '@/utils/post-feedback';
import type { ActionResult } from '@/types';


const siteTitle = 'Terminal | 中京大学プログラミングサークル';


/**
 * 連続投稿を制限する期間（ms）。
 */
const COMMENT_RATE_LIMIT_WINDOW = 10 * 60 * 1000;


/**
 * 連続投稿を制限する期間内に、1人の訪問者が投稿できるコメントの数。
 */
const COMMENT_RATE_LIMIT_COUNT = 5;


export async function generateMetadata({ params }: { params: Promise<{ year: string; slug: string }> }): Promise<Metadata> {
  const { year, slug } = await params;
  if (!/^\d{4}$/.test(year)) {
    return {
      title: `投稿 | ${siteTitle}`,
    };
  }
  const yearNumber = Number(year);
  const startOfYear = getFiscalYearStart(yearNumber);
  const startOfNextYear = getFiscalYearStart(yearNumber + 1);
  const postMeta = await db
    .select({
      title: publishedPostsView.title,
      description: publishedPostsView.description,
    })
    .from(publishedPostsView)
    .where(and(
      eq(publishedPostsView.slug, slug),
      gte(publishedPostsView.publishedAt, startOfYear),
      lt(publishedPostsView.publishedAt, startOfNextYear),
    ))
    .then((result) => result.at(0)); // XXX: `result[0]` とすると型が `T | undefined` にならないため、`result.at(0)` としている

  if (!postMeta) {
    return {
      title: `投稿 | ${siteTitle}`,
    };
  }

  return {
    title: `${postMeta.title} | ${siteTitle}`,
    description: postMeta.description ?? undefined,
  };
}


/**
 * 日時をフォーマットする。
 * @param date - フォーマットする日時。
 * @returns フォーマット済みの日時文字列。null の場合は `-` を返す。
 */
const formatDate = (date: Date | null): string => date ? (
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  }).format(date)
) : '-';


export default async function Post({ params }: { params: Promise<{ year: string; slug: string }> }): Promise<JSX.Element> {
  const { year, slug } = await params;
  const yearNumber = Number(year);
  if (!/^\d{4}$/.test(year) || !Number.isInteger(yearNumber)) {
    notFound();
  }
  const startOfYear = getFiscalYearStart(yearNumber);
  const startOfNextYear = getFiscalYearStart(yearNumber + 1);
  const post = await db
    .select({
      id: publishedPostsView.id,
      slug: publishedPostsView.slug,
      author: {
        id: publishedPostsView.authorId,
        name: publishedPostsView.authorName,
        displayName: publishedPostsView.authorDisplayName,
      },
      title: publishedPostsView.title,
      description: publishedPostsView.description,
      content: publishedPostsView.content,
      tags: publishedPostsView.tags,
      publishedAt: publishedPostsView.publishedAt,
      updatedAt: publishedPostsView.updatedAt,
      hasDraft: publishedPostsView.hasDraft,
    })
    .from(publishedPostsView)
    .where(and(
      eq(publishedPostsView.slug, slug),
      gte(publishedPostsView.publishedAt, startOfYear),
      lt(publishedPostsView.publishedAt, startOfNextYear),
    ))
    .then((result) => result.at(0)); // XXX: `result[0]` とすると型が `T | undefined` にならないため、`result.at(0)` としている
  if (!post) {
    notFound();
  }
  // 公開ページに表示できる版（公開済みで、非公開にしていない版）の数
  const publicVersionCount = await db
    .select({ count: count() })
    .from(postContentsTable)
    .where(and(
      eq(postContentsTable.postId, post.id),
      isNotNull(postContentsTable.publishedAt),
      eq(postContentsTable.isPrivate, false),
    ))
    .then((result) => result.at(0)?.count ?? 0);

  const postId = post.id;
  const visitorId = await getVisitorId();
  const [ratingSummary, myRating, comments] = await Promise.all([
    selectRatingSummary(postId),
    visitorId ? selectVisitorRating(postId, visitorId) : null,
    selectComments(postId),
  ]);
  const turnstileExpectation = {
    action: POST_FEEDBACK_TURNSTILE_ACTION,
    cdata: toPostFeedbackTurnstileCData(postId),
  };

  async function handleRate(value: RatingValue | null, turnstileToken: string): Promise<ActionResult<RatingState>> {
    'use server';
    if (value !== null && value !== 'positive' && value !== 'negative') {
      return { ok: false, error: '評価が正しくありません。' };
    }
    if (!await verifyNonInteractiveTurnstileToken(turnstileToken, turnstileExpectation)) {
      return { ok: false, error: 'ボット対策の確認に失敗しました。時間をおいて再度お試しください。' };
    }
    try {
      if (!await isPublicPost(postId)) {
        return { ok: false, error: 'この記事は現在公開されていません。' };
      }
      const currentVisitorId = await getOrCreateVisitorId();
      await (value === null
        ? db
          .delete(postRatingsTable)
          .where(and(eq(postRatingsTable.postId, postId), eq(postRatingsTable.visitorId, currentVisitorId)))
        : db
          .insert(postRatingsTable)
          .values({ postId, visitorId: currentVisitorId, isPositive: value === 'positive' })
          .onConflictDoUpdate({
            target: [postRatingsTable.postId, postRatingsTable.visitorId],
            set: { isPositive: value === 'positive', updatedAt: new Date() },
          }));
      return {
        ok: true,
        data: { summary: await selectRatingSummary(postId), myRating: value },
      };
    } catch (e) {
      console.error('Failed to rate post:', e);
      return { ok: false, error: '評価を送信できませんでした。' };
    }
  }

  async function handleComment(
    values: CommentFormValues,
    parentId: number | null,
    turnstileToken: string,
  ): Promise<ActionResult<CommentPostResult>> {
    'use server';
    if (parentId !== null && !(Number.isSafeInteger(parentId) && parentId > 0)) {
      return { ok: false, error: '返信先のコメントが正しくありません。' };
    }
    const parsed = CommentFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    if (!await verifyNonInteractiveTurnstileToken(turnstileToken, turnstileExpectation)) {
      return { ok: false, error: 'BOT対策の確認に失敗しました。時間をおいて再度お試しください。' };
    }
    try {
      if (!await isPublicPost(postId)) {
        return { ok: false, error: 'この記事は現在公開されていません。' };
      }
      // 返信の場合は、公開ページに表示されているコメントにのみ返信できる
      let threadId: number | null = null;
      if (parentId !== null) {
        const target = await findReplyTarget(postId, parentId);
        if (!target?.isVisible) {
          return { ok: false, error: '返信先のコメントが見つかりませんでした。削除された可能性があります。' };
        }
        threadId = target.threadId;
      }
      const currentVisitorId = await getOrCreateVisitorId();
      const recentCount = await countRecentVisitorComments(currentVisitorId, COMMENT_RATE_LIMIT_WINDOW);
      if (recentCount >= COMMENT_RATE_LIMIT_COUNT) {
        return { ok: false, error: '短時間に多くのコメントが投稿されました。しばらくしてから再度お試しください。' };
      }
      const [created] = await db
        .insert(postCommentsTable)
        .values({
          postId,
          threadId,
          parentId,
          visitorId: currentVisitorId,
          authorName: parsed.data.authorName,
          authorEmail: parsed.data.authorEmail,
          content: parsed.data.content,
        })
        .returning({ id: postCommentsTable.id });
      return {
        ok: true,
        data: { comments: toPublicComments(await selectComments(postId)), postedId: created.id },
      };
    } catch (e) {
      console.error('Failed to post comment:', e);
      return { ok: false, error: 'コメントを投稿できませんでした。' };
    }
  }

  // 本文は一度だけ解析し、HTML への変換と、構造化データに載せる画像の抽出に使う
  const markdownEnvironment = {};
  const contentTokens = markdownIt.parse(post.content, markdownEnvironment);
  const contentHtml = markdownIt.renderer.render(contentTokens, markdownIt.options, markdownEnvironment);

  const siteUrl = getSiteUrl();
  const postPath = `/posts/${year}/${post.slug}`;

  return (
    <div className="space-y-8 z-50 pt-20">
      {siteUrl && (
        <JsonLd
          nodes={[
            toBlogPosting(siteUrl, {
              path: postPath,
              title: post.title,
              description: post.description,
              authorName: post.author.displayName || post.author.name,
              publishedAt: post.publishedAt!,
              updatedAt: post.updatedAt!,
              tags: post.tags.map((tag) => tag.name),
              imageSources: extractImageSources(contentTokens),
            }),
            toBreadcrumbList(siteUrl, [
              { name: '投稿一覧', path: '/posts' },
              { name: post.title, path: postPath },
            ]),
          ]}
        />
      )}
      <div className="flex justify-between items-start">
        <h1 className="text-4xl font-bold text-emerald-400 flex items-center">
          {post.title}
        </h1>
        <div className="text-sm text-gray-400 ml-4">
          <p className="mt-0! mb-1!">著者: {post.author.displayName || post.author.name}</p>
          <div className="flex space-x-4">
            <p className="my-0!">
              投稿日: <time dateTime={post.publishedAt!.toISOString()}>{formatDate(post.publishedAt)}</time>
            </p>
            {post.publishedAt!.getTime() !== post.updatedAt!.getTime() && (
              <p className="my-0!">
                最終更新日: <time dateTime={post.updatedAt!.toISOString()}>{formatDate(post.updatedAt)}</time>
              </p>
            )}
          </div>
          {publicVersionCount > 1 && (
            <Link
              href={`/posts/${year}/${slug}/history`}
              className="mt-1 inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 hover:underline"
            >
              <History className="h-4 w-4" aria-hidden />
              編集履歴（{publicVersionCount}版）
            </Link>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {post.tags.map((tag) => (
          <Link key={tag.slug} href={`/posts?tags=${tag.slug}`} className="text-emerald-300 hover:text-emerald-200 hover:underline">
            #{tag.name}
          </Link>
        ))}
      </div>
      <div className="h-1 w-20 bg-emerald-400 rounded"></div>
      <div className="space-y-16 text-gray-200">
        <div className="markdown-body" dangerouslySetInnerHTML={{ __html: contentHtml }} />
      </div>
      <PostFeedback
        postId={postId}
        turnstileSiteKey={process.env.CLOUDFLARE_TURNSTILE_NON_INTERACTIVE_SITE_KEY || null}
        initialRating={{ summary: ratingSummary, myRating }}
        initialComments={toPublicComments(comments)}
        onRate={handleRate}
        onComment={handleComment}
      />
    </div>
  );
}
