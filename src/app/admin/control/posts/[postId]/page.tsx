import { and, asc, count, eq } from 'drizzle-orm';

import Editor from './_components/editor';
import { PostActionError, syncPostTags, toErrorMessage } from './_lib/post-actions';
import { PostFormSchema, normalizeDescription } from './_lib/post-form';
import { db } from '@/lib/drizzle';
import { postContentsTable, postTagsTable, postsTable, tagsTable, usersTable } from '@/db/schema';
import { checkPermission, getCurrentAccount } from '@/lib/auth';
import {
  ORGANIZATION_ERROR,
  invalidateOpenReviews,
  isVersionApproved,
  selectReviewPanel,
  submitReviewRequest,
  withdrawReviewRequest,
} from '@/utils/post-review';
import { loadOrganization } from '@/lib/organization';
import { isExecutive } from '@/lib/review-routing';
import { selectManagedImages } from '@/utils/image-queries';
import { saveUploadedImage } from '@/utils/image-upload';
import { selectCommentCounts } from '@/utils/post-feedback-queries';
import { getFirstPublishedAt, publishPostVersion, selectLatestPostContent } from '@/utils/post-publish';
import { selectPostVersions } from '@/utils/post-version-queries';
import { getFiscalYear } from '@/utils/date';

import { getPostStatus } from '../_lib/post-status';

import type { JSX } from 'react';
import type { Transaction } from './_lib/post-actions';
import type { PostFormValues, PublishResult, SaveResult } from './_lib/post-form';
import type { ReviewRoute, ReviewSubmission } from '@/lib/review-routing';
import type { ImageInfo, ManagedImage } from '@/utils/images';
import type { PostVersion } from '@/utils/post-versions';
import type { ActionResult } from '@/types';

export const dynamic = 'force-dynamic';


/**
 * 公開予約の日時として指定できる、現在時刻からの最短の時間（ms）。
 */
const MIN_SCHEDULE_DELAY = 60 * 1000;


/**
 * 投稿の執筆者（利用者の ID）を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @returns 執筆者の ID。投稿が見つからない場合は `undefined`
 */
async function selectPostAuthorId(executor: Pick<Transaction, 'select'>, postId: number): Promise<number | undefined> {
  return await executor
    .select({ authorId: postsTable.authorId })
    .from(postsTable)
    .where(eq(postsTable.id, postId))
    .limit(1)
    .then((rows) => rows.at(0)?.authorId);
}


/**
 * 現在の利用者が投稿の執筆者であることを確かめる（レビューの依頼・取り下げに使う）。
 *
 * Server Action の中で呼び出す関数は、Server Action の外で定義してから引数で渡すこと（閉じ込めた変数はクライアントとの間で受け渡せないため）。
 *
 * @param postId - 投稿ID
 * @returns 執筆者でない場合は利用者に表示するメッセージ、執筆者の場合は `null`
 */
async function checkPostAuthor(postId: number): Promise<string | null> {
  const account = await getCurrentAccount();
  if (!account) {
    return 'ログインしてください。';
  }
  return (await selectPostAuthorId(db, postId)) === account.id ? null : '執筆者だけが操作できます。';
}


/**
 * 組織の情報（担当課の一覧と、組織運営に関する記事を執筆できるか）を読み込む。読み込めない場合はメッセージを返す。
 *
 * @param accountCuId - 利用者の学籍番号
 * @returns 担当課の一覧・執筆権限・失敗時のメッセージ
 */
async function loadReviewOptions(accountCuId: string | undefined): Promise<{
  divisions: { dn: string; name: string }[];
  canSubmitOrganizational: boolean;
  organizationError: string | null;
}> {
  try {
    const organization = await loadOrganization();
    return {
      divisions: organization.divisions.map((division) => ({ dn: division.dn, name: division.name })),
      canSubmitOrganizational: accountCuId !== undefined && isExecutive(organization, accountCuId),
      organizationError: null,
    };
  } catch (e) {
    console.error('Failed to load organization from LDAP:', e);
    return { divisions: [], canSubmitOrganizational: false, organizationError: ORGANIZATION_ERROR };
  }
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
        authorId: postsTable.authorId,
        authorName: usersTable.name,
        authorDisplayName: usersTable.displayName,
      })
      .from(postsTable)
      .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
      .where(eq(postsTable.id, postId))
      .limit(1)
      .then((result) => result.at(0))
    : undefined;
  const latestContent = post ? await selectLatestPostContent(db, postId) : undefined;

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
  const account = await getCurrentAccount();
  const [reviewPanel, reviewOptions] = await Promise.all([
    selectReviewPanel(postId, latestContent.identifier),
    loadReviewOptions(account?.cuId),
  ]);
  const isAuthor = account !== null && account.id === post.authorId;

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
        // 画面を開いた後に別の画面で保存・公開されている可能性があるため、保存時点の最新の版を取得し、行をロックする
        const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }

        const isContentChanged = latest.title !== data.title
          || latest.description !== data.description
          || latest.content !== data.content;
        // 予約していた内容が変わった場合は、予約を取り消す（変更後の内容は改めて予約してもらう）
        let isScheduleCanceled = false;
        // レビュー中・承認済みの内容が変わった場合は、レビューを取り消す（改めてレビューを依頼してもらう）
        let isReviewInvalidated = false;
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
            isReviewInvalidated = await invalidateOpenReviews(tx, postId, latest.identifier) > 0;
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

        return { ok: true, savedAt: new Date(), isScheduleCanceled, isReviewInvalidated };
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
    const account = await getCurrentAccount();
    try {
      return await db.transaction(async (tx): Promise<PublishResult> => {
        const currentPost = await tx
          .select({ slug: postsTable.slug, authorId: postsTable.authorId })
          .from(postsTable)
          .where(eq(postsTable.id, postId))
          .limit(1)
          .then((result) => result.at(0));
        const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
        if (!currentPost || !latest) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (account?.id !== currentPost.authorId) {
          return { ok: false, error: '公開できるのは執筆者だけです。' };
        }
        if (latest.publishedAt) {
          return { ok: false, error: '公開されていない変更はありません。' };
        }
        if (!(await isVersionApproved(tx, postId, latest.identifier))) {
          return { ok: false, error: 'レビューで承認されていないため、公開できません。' };
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
    const account = await getCurrentAccount();
    try {
      return await db.transaction(async (tx): Promise<ActionResult<Date>> => {
        const authorId = await selectPostAuthorId(tx, postId);
        const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
        if (!latest || authorId === undefined) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (account?.id !== authorId) {
          return { ok: false, error: '公開を予約できるのは執筆者だけです。' };
        }
        if (latest.publishedAt) {
          return { ok: false, error: '公開されていない変更がないため、予約できません。' };
        }
        if (!(await isVersionApproved(tx, postId, latest.identifier))) {
          return { ok: false, error: 'レビューで承認されていないため、予約できません。' };
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
    const account = await getCurrentAccount();
    try {
      return await db.transaction(async (tx): Promise<ActionResult> => {
        const authorId = await selectPostAuthorId(tx, postId);
        const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
        if (!latest || authorId === undefined) {
          return { ok: false, error: '投稿が見つかりませんでした。' };
        }
        if (account?.id !== authorId) {
          return { ok: false, error: '公開予約を取り消せるのは執筆者だけです。' };
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

  async function handleSubmitReview(submission: ReviewSubmission): Promise<ActionResult<ReviewRoute>> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    if (
      typeof submission?.isOrganizational !== 'boolean'
      || (submission.divisionDn !== null && typeof submission.divisionDn !== 'string')
    ) {
      return { ok: false, error: '依頼の内容が正しくありません。' };
    }
    const authorError = await checkPostAuthor(postId);
    if (authorError) {
      return { ok: false, error: authorError };
    }
    const account = await getCurrentAccount();
    if (!account) {
      return { ok: false, error: 'ログインしてください。' };
    }
    const outcome = await submitReviewRequest(postId, account, {
      divisionDn: submission.divisionDn,
      isOrganizational: submission.isOrganizational,
    });
    return outcome.ok ? { ok: true, data: outcome.value } : { ok: false, error: outcome.error };
  }

  async function handleWithdrawReview(): Promise<ActionResult> {
    'use server';
    const permissionError = await checkPermission('user');
    if (permissionError) {
      return { ok: false, error: permissionError };
    }
    const authorError = await checkPostAuthor(postId);
    if (authorError) {
      return { ok: false, error: authorError };
    }
    const outcome = await withdrawReviewRequest(postId);
    return outcome.ok ? { ok: true } : { ok: false, error: outcome.error };
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
        review={{
          panel: reviewPanel,
          isAuthor,
          divisions: reviewOptions.divisions,
          canSubmitOrganizational: reviewOptions.canSubmitOrganizational,
          organizationError: reviewOptions.organizationError,
        }}
        onSubmitReview={handleSubmitReview}
        onWithdrawReview={handleWithdrawReview}
        onLoadHistory={handleLoadHistory}
        onSetVersionPrivate={handleSetVersionPrivate}
        onUploadImage={handleUploadImage}
        onLoadImages={handleLoadImages}
      />
    </div>
  );
}
