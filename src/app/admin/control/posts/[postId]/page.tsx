import { and, asc, count, desc, eq } from 'drizzle-orm';

import Editor from './_components/editor';
import { PostActionError, syncPostTags, toErrorMessage } from './_lib/post-actions';
import { PostFormSchema, normalizeDescription } from './_lib/post-form';
import { db } from '@/lib/drizzle';
import { postContentsTable, postTagsTable, postsTable, tagsTable, usersTable } from '@/db/schema';
import { checkPermission } from '@/lib/auth';
import { selectManagedImages } from '@/utils/image-queries';
import { saveUploadedImage } from '@/utils/image-upload';
import { selectCommentCounts } from '@/utils/post-feedback-queries';
import { getFirstPublishedAt, publishPostVersion } from '@/utils/post-publish';
import { selectPostVersions } from '@/utils/post-version-queries';
import { getFiscalYear } from '@/utils/date';

import { getPostStatus } from '../_lib/post-status';

import type { JSX } from 'react';
import type { Transaction } from './_lib/post-actions';
import type { PostFormValues, PublishResult, SaveResult } from './_lib/post-form';
import type { ImageInfo, ManagedImage } from '@/utils/images';
import type { PostVersion } from '@/utils/post-versions';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * 公開予約の日時として指定できる、現在時刻からの最短の時間（ms）。
 */
const MIN_SCHEDULE_DELAY = 60 * 1000;


/**
 * 投稿の最新の版（内容）を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @param options - `forUpdate` が `true` の場合は、取得した版の行を更新できないようにロックする（トランザクション内で使う）
 * @returns 最新の版。存在しない場合は `undefined`
 */
async function getLatestPostContent(
  executor: Pick<Transaction, 'select'>,
  postId: number,
  options: { forUpdate?: boolean } = {},
) {
  const query = executor
    .select()
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postId))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1);
  return await (options.forUpdate ? query.for('update') : query).then((result) => result.at(0));
}


export default async function PostEditPage({ params }: { params: Promise<{ postId: string }> }): Promise<JSX.Element> {
  const { postId: postIdParameter } = await params;
  const postId = Number(postIdParameter);
  const isValidPostId = /^\d+$/.test(postIdParameter) && Number.isSafeInteger(postId);

  const post = isValidPostId
    ? await db
      .select({
        slug: postsTable.slug,
        isPrivate: postsTable.isPrivate,
        authorName: usersTable.name,
        authorDisplayName: usersTable.displayName,
      })
      .from(postsTable)
      .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
      .where(eq(postsTable.id, postId))
      .limit(1)
      .then((result) => result.at(0))
    : undefined;
  const latestContent = post ? await getLatestPostContent(db, postId) : undefined;

  if (!post || !latestContent) {
    return (
      <div className="mx-auto px-4 py-12">
        <h1 className="text-2xl">投稿編集</h1>
        <p>投稿が見つかりませんでした。</p>
      </div>
    );
  }

  const [firstPublishedAt, postTags, availableTags, commentCounts] = await Promise.all([
    getFirstPublishedAt(db, postId),
    db
      .select({ name: tagsTable.name, slug: tagsTable.slug })
      .from(postTagsTable)
      .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
      .where(eq(postTagsTable.postId, postId))
      .orderBy(asc(tagsTable.name)),
    db
      .select({ name: tagsTable.name, slug: tagsTable.slug, postCount: count(postTagsTable.postId) })
      .from(tagsTable)
      .leftJoin(postTagsTable, eq(tagsTable.id, postTagsTable.tagId))
      .groupBy(tagsTable.id)
      .orderBy(asc(tagsTable.name)),
    selectCommentCounts(postId).then((result) => result.at(0)),
  ]);
  const status = getPostStatus(latestContent.publishedAt, firstPublishedAt);

  async function handleSave(values: PostFormValues): Promise<SaveResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const parsed = PostFormSchema.safeParse(values);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません。' };
    }
    const data = { ...parsed.data, description: normalizeDescription(parsed.data.description) };
    try {
      return await db.transaction(async (tx): Promise<SaveResult> => {
        const currentPost = await tx
          .select({ slug: postsTable.slug, isPrivate: postsTable.isPrivate })
          .from(postsTable)
          .where(eq(postsTable.id, postId))
          .limit(1)
          .then((result) => result.at(0));
        // 画面を開いた後に別の画面で保存・公開されている可能性があるため、保存時点の最新の版を取得する
        const latest = await getLatestPostContent(tx, postId);
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }

        const isContentChanged = latest.title !== data.title
          || latest.description !== data.description
          || latest.content !== data.content;
        // 予約していた内容が変わった場合は、予約を取り消す（変更後の内容は改めて予約してもらう）
        let isScheduleCanceled = false;
        if (isContentChanged) {
          if (latest.publishedAt) {
            // 公開済みの版は書き換えず、新しい版（下書き）として追加する
            await tx
              .insert(postContentsTable)
              // eslint-disable-next-line unicorn/no-unused-array-method-return
              .values({
                postId,
                title: data.title,
                description: data.description,
                content: data.content,
              });
          } else {
            isScheduleCanceled = latest.scheduledPublishAt !== null;
            await tx
              .update(postContentsTable)
              .set({
                title: data.title,
                description: data.description,
                content: data.content,
                scheduledPublishAt: null,
              })
              .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, latest.identifier)));
          }
        }

        if (currentPost.slug !== data.slug || currentPost.isPrivate !== data.isPrivate) {
          await tx
            .update(postsTable)
            .set({ slug: data.slug, isPrivate: data.isPrivate })
            .where(eq(postsTable.id, postId));
        }

        // タグは版ごとではなく記事ごとに管理しているため、保存時点で公開ページにも反映される
        await syncPostTags(tx, postId, data.tags);

        return { ok: true, savedAt: new Date(), isScheduleCanceled };
      });
    } catch (e) {
      if (!(e instanceof PostActionError)) {
        console.error('Failed to save post:', e);
      }
      return { ok: false, error: toErrorMessage(e, '保存に失敗しました。') };
    }
  }

  async function handlePublish(): Promise<PublishResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    try {
      return await db.transaction(async (tx): Promise<PublishResult> => {
        const currentPost = await tx
          .select({ slug: postsTable.slug })
          .from(postsTable)
          .where(eq(postsTable.id, postId))
          .limit(1)
          .then((result) => result.at(0));
        const latest = await getLatestPostContent(tx, postId, { forUpdate: true });
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (latest.publishedAt) {
          return { ok: false, error: '公開されていない変更はありません。' };
        }

        // 公開予約がある場合も、今すぐ公開することで予約は解除される
        const { year, isFirstPublication } = await publishPostVersion(tx, postId, latest.identifier, new Date());
        return {
          ok: true,
          year,
          slug: currentPost.slug,
          title: latest.title,
          description: latest.description,
          isFirstPublication,
        };
      });
    } catch (e) {
      if (!(e instanceof PostActionError)) {
        console.error('Failed to publish post:', e);
      }
      return { ok: false, error: toErrorMessage(e, '公開に失敗しました。') };
    }
  }

  async function handleSchedule(scheduledAtText: string): Promise<ActionResult<Date>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const scheduledAt = new Date(scheduledAtText);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < Date.now() + MIN_SCHEDULE_DELAY) {
      return { ok: false, error: '公開予約は1分以上先の日時を指定してください。' };
    }
    try {
      return await db.transaction(async (tx): Promise<ActionResult<Date>> => {
        const latest = await getLatestPostContent(tx, postId, { forUpdate: true });
        if (!latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (latest.publishedAt) {
          return { ok: false, error: '公開されていない変更がないため、予約できません。' };
        }
        await tx
          .update(postContentsTable)
          .set({ scheduledPublishAt: scheduledAt })
          .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, latest.identifier)));
        return { ok: true, data: scheduledAt };
      });
    } catch (e) {
      console.error('Failed to schedule post:', e);
      return { ok: false, error: '公開を予約できませんでした。' };
    }
  }

  async function handleCancelSchedule(): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    try {
      return await db.transaction(async (tx): Promise<ActionResult> => {
        const latest = await getLatestPostContent(tx, postId, { forUpdate: true });
        if (!latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (latest.publishedAt === null && latest.scheduledPublishAt !== null) {
          await tx
            .update(postContentsTable)
            .set({ scheduledPublishAt: null })
            .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, latest.identifier)));
        }
        return { ok: true };
      });
    } catch (e) {
      console.error('Failed to cancel scheduled post:', e);
      return { ok: false, error: '予約を取り消せませんでした。' };
    }
  }

  async function handleLoadHistory(): Promise<ActionResult<PostVersion[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    try {
      return { ok: true, data: await selectPostVersions(postId) };
    } catch (e) {
      console.error('Failed to load post history:', e);
      return { ok: false, error: '編集履歴を読み込めませんでした。' };
    }
  }

  async function handleSetVersionPrivate(identifier: number, isPrivate: boolean): Promise<ActionResult<PostVersion[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (!Number.isSafeInteger(identifier) || identifier <= 0 || typeof isPrivate !== 'boolean') {
      return { ok: false, error: '指定された版が正しくありません。' };
    }
    try {
      await db.transaction(async (tx) => {
        // 同時に操作されても公開中の版がなくならないよう、記事のすべての版をロックしてから確認する
        const versions = await tx
          .select({
            identifier: postContentsTable.identifier,
            isPrivate: postContentsTable.isPrivate,
            publishedAt: postContentsTable.publishedAt,
            updatedAt: postContentsTable.updatedAt,
          })
          .from(postContentsTable)
          .where(eq(postContentsTable.postId, postId))
          .for('update');
        const target = versions.find((version) => version.identifier === identifier);
        if (!target) {
          throw new PostActionError('指定された版が見つかりませんでした。');
        }
        if (!target.publishedAt) {
          throw new PostActionError('公開されていない版（下書き）の公開設定は変更できません。');
        }
        if (target.isPrivate === isPrivate) {
          return;
        }
        const hasOtherPublicVersion = versions.some((version) => (
          version.identifier !== identifier && version.publishedAt !== null && !version.isPrivate
        ));
        if (isPrivate && !hasOtherPublicVersion) {
          throw new PostActionError(
            '公開中の版がなくなるため、この版は非公開にできません。記事全体を非公開にする場合は、「非公開にする」を設定して保存してください。',
          );
        }
        await tx
          .update(postContentsTable)
          // 内容の編集ではないため、更新日時（最終保存日時として表示される）は変更しない
          .set({ isPrivate, updatedAt: target.updatedAt })
          .where(and(eq(postContentsTable.postId, postId), eq(postContentsTable.identifier, identifier)));
      });
      return { ok: true, data: await selectPostVersions(postId) };
    } catch (e) {
      if (!(e instanceof PostActionError)) {
        console.error('Failed to change version visibility:', e);
      }
      return { ok: false, error: toErrorMessage(e, '版の公開設定を変更できませんでした。') };
    }
  }

  async function handleUploadImage(formData: FormData): Promise<ActionResult<ImageInfo>> {
    'use server';
    return await saveUploadedImage(formData);
  }

  async function handleLoadImages(): Promise<ActionResult<ManagedImage[]>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    try {
      return { ok: true, data: await selectManagedImages() };
    } catch (e) {
      console.error('Failed to load images:', e);
      return { ok: false, error: '画像を読み込めませんでした。' };
    }
  }

  return (
    <div className="mx-auto px-4 py-12">
      <Editor
        postId={postId}
        initialValues={{
          title: latestContent.title,
          description: latestContent.description,
          slug: post.slug,
          isPrivate: post.isPrivate,
          tags: postTags,
          content: latestContent.content,
        }}
        author={post.authorDisplayName || post.authorName}
        status={status}
        publishedYear={firstPublishedAt ? getFiscalYear(firstPublishedAt) : null}
        expectedYear={getFiscalYear(new Date())}
        firstPublishedAt={firstPublishedAt}
        scheduledPublishAt={latestContent.scheduledPublishAt}
        lastSavedAt={latestContent.updatedAt}
        availableTags={availableTags}
        commentCount={commentCounts?.commentCount ?? 0}
        unrepliedCommentCount={commentCounts?.unrepliedCount ?? 0}
        onSave={handleSave}
        onPublish={handlePublish}
        onSchedule={handleSchedule}
        onCancelSchedule={handleCancelSchedule}
        onLoadHistory={handleLoadHistory}
        onSetVersionPrivate={handleSetVersionPrivate}
        onUploadImage={handleUploadImage}
        onLoadImages={handleLoadImages}
      />
    </div>
  );
}
