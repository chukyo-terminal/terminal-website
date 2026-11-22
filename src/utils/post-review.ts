import { and, asc, desc, eq, inArray } from 'drizzle-orm';

import { postContentsTable, postReviewActionsTable, postReviewRequestsTable, usersTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { loadOrganization } from '@/lib/organization';
import { describeReviewStage, getCurrentReviewers, planReviewRoute } from '@/lib/review-routing';
import { selectLatestPostContent } from '@/utils/post-publish';

import type { Organization } from '@/lib/organization';
import type { ReviewRoute, ReviewSubmission } from '@/lib/review-routing';


/**
 * トランザクション内でクエリを実行するオブジェクト。
 */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];


/**
 * レビューの依頼の状態。
 *
 * - `pending`: 審査中
 * - `approved`: 承認済み（公開・公開予約できる）
 * - `rejected`: 差し戻し（内容を修正して再依頼する）
 * - `withdrawn`: 執筆者が取り下げた
 * - `invalidated`: 審査中・承認済みの内容が変更されたため取り消された
 */
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn' | 'invalidated';


/**
 * 依頼の状態の表示名。
 */
export const REVIEW_STATUS_LABELS: Readonly<Record<ReviewStatus, string>> = {
  pending: '審査中',
  approved: '承認済み',
  rejected: '差し戻し',
  withdrawn: '取り下げ',
  invalidated: '内容の変更により取り消し',
};


/**
 * 組織の情報を読み込めなかった場合に表示するメッセージ。
 */
export const ORGANIZATION_ERROR = '組織の情報（LDAP）を読み込めませんでした。時間をおいて再度お試しください。';


/**
 * 操作を行う利用者。
 */
export type ReviewAccount = {
  id: number;
  cuId: string;
  name: string;
};


/**
 * 処理の結果。失敗した場合は利用者に表示する理由を持つ。
 */
export type Outcome<T = null> = { ok: true; value: T } | { ok: false; error: string };


/**
 * 依頼の表示用の値。
 */
export type ReviewRequestView = {
  id: number;
  status: ReviewStatus;
  statusLabel: string;
  route: ReviewRoute;
  stage: number;
  /** 審査中の場合の段階の表示名（審査中でなければ空文字列） */
  stageLabel: string;
  divisionName: string | null;
  requestedAt: Date;
  closedAt: Date | null;
};


/**
 * 承認・差し戻しの操作の表示用の値。
 */
export type ReviewActionView = {
  stage: number;
  reviewerName: string;
  isApproved: boolean;
  comment: string | null;
  createdAt: Date;
};


/**
 * 記事編集画面に表示する、最新の版のレビューの状態。
 */
export type ReviewPanel = {
  /** 最新の版の最新の依頼（依頼していない場合は `null`） */
  request: ReviewRequestView | null;
  /** その依頼の操作（段階順） */
  actions: ReviewActionView[];
  /** 公開できるかどうか（最新の依頼が承認済みの場合） */
  isApproved: boolean;
};


/**
 * レビューの一覧に表示する、自分が承認できる依頼。
 */
export type PendingReview = {
  requestId: number;
  postTitle: string;
  authorName: string;
  divisionName: string | null;
  stageLabel: string;
  requestedAt: Date;
};


/**
 * レビューの詳細画面に表示する依頼。
 */
export type ReviewDetail = {
  request: ReviewRequestView;
  authorName: string;
  postTitle: string;
  postDescription: string | null;
  postContent: string;
  actions: ReviewActionView[];
  /** 承認できる人の氏名（審査中の場合） */
  reviewerNames: string[];
  /** 操作している利用者が承認できるかどうか */
  canReview: boolean;
};


/**
 * 依頼の行を表示用の値にする。
 *
 * @param row - 依頼の行
 * @returns 表示用の値
 */
function toRequestView(row: typeof postReviewRequestsTable.$inferSelect): ReviewRequestView {
  const status = row.status as ReviewStatus;
  return {
    id: row.id,
    status,
    statusLabel: REVIEW_STATUS_LABELS[status],
    route: row.route as ReviewRoute,
    stage: row.stage,
    stageLabel: status === 'pending' ? describeReviewStage(row.route, row.stage) : '',
    divisionName: row.divisionName,
    requestedAt: row.createdAt,
    closedAt: row.closedAt,
  };
}


/**
 * 版の最新の依頼を取得する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @param identifier - 版の識別子
 * @param forUpdate - `true` の場合は行をロックする（トランザクション内で使う）
 * @returns 最新の依頼。依頼していない場合は `undefined`
 */
async function selectLatestReviewRequest(
  executor: Pick<Transaction, 'select'>,
  postId: number,
  identifier: number,
  forUpdate = false,
) {
  const query = executor
    .select()
    .from(postReviewRequestsTable)
    .where(and(eq(postReviewRequestsTable.postId, postId), eq(postReviewRequestsTable.postIdentifier, identifier)))
    .orderBy(desc(postReviewRequestsTable.id))
    .limit(1);
  return await (forUpdate ? query.for('update') : query).then((rows) => rows.at(0));
}


/**
 * 依頼の操作（承認・差し戻し）を段階順に取得する。承認者の学籍番号は判定のために含める。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param requestId - 依頼ID
 * @returns 操作の一覧
 */
async function selectReviewActions(
  executor: Pick<Transaction, 'select'>,
  requestId: number,
): Promise<(ReviewActionView & { reviewerCuId: string })[]> {
  const rows = await executor
    .select({
      stage: postReviewActionsTable.stage,
      reviewerCuId: postReviewActionsTable.reviewerCuId,
      reviewerName: postReviewActionsTable.reviewerName,
      isApproved: postReviewActionsTable.isApproved,
      comment: postReviewActionsTable.comment,
      createdAt: postReviewActionsTable.createdAt,
    })
    .from(postReviewActionsTable)
    .where(eq(postReviewActionsTable.requestId, requestId))
    .orderBy(asc(postReviewActionsTable.stage));
  return rows;
}


/**
 * 記事編集画面に表示する、最新の版のレビューの状態を取得する。
 *
 * @param postId - 投稿ID
 * @param identifier - 最新の版の識別子
 * @returns レビューの状態
 */
export async function selectReviewPanel(postId: number, identifier: number): Promise<ReviewPanel> {
  const row = await selectLatestReviewRequest(db, postId, identifier);
  if (!row) {
    return { request: null, actions: [], isApproved: false };
  }
  return {
    request: toRequestView(row),
    actions: await selectReviewActions(db, row.id),
    isApproved: row.status === 'approved',
  };
}


/**
 * 版が公開できる状態（最新の依頼が承認済み）かどうかを判定する。
 *
 * @param executor - クエリを実行するオブジェクト
 * @param postId - 投稿ID
 * @param identifier - 版の識別子
 * @returns 承認済みの場合は `true`
 */
export async function isVersionApproved(
  executor: Pick<Transaction, 'select'>,
  postId: number,
  identifier: number,
): Promise<boolean> {
  const latest = await selectLatestReviewRequest(executor, postId, identifier);
  return latest?.status === 'approved';
}


/**
 * 版の審査中・承認済みの依頼を取り消す（内容を変更したとき）。
 *
 * 呼び出し元は、版の行をロックした後に呼び出すこと。
 *
 * @param tx - トランザクション
 * @param postId - 投稿ID
 * @param identifier - 版の識別子
 */
export async function invalidateOpenReviews(tx: Transaction, postId: number, identifier: number): Promise<number> {
  const invalidated = await tx
    .update(postReviewRequestsTable)
    .set({ status: 'invalidated', closedAt: new Date() })
    .where(and(
      eq(postReviewRequestsTable.postId, postId),
      eq(postReviewRequestsTable.postIdentifier, identifier),
      inArray(postReviewRequestsTable.status, ['pending', 'approved']),
    ))
    .returning({ id: postReviewRequestsTable.id });
  return invalidated.length;
}


/**
 * 組織の情報を読み込む。失敗した場合は利用者に表示するメッセージを返す。
 *
 * @returns 組織の情報、または失敗した場合のメッセージ
 */
async function loadOrganizationOutcome(): Promise<Outcome<Organization>> {
  try {
    return { ok: true, value: await loadOrganization() };
  } catch (e) {
    console.error('Failed to load organization from LDAP:', e);
    return { ok: false, error: ORGANIZATION_ERROR };
  }
}


/**
 * 最新の版のレビューを依頼する。担当課の承認者が決まっていない場合は依頼できない。
 *
 * @param postId - 投稿ID
 * @param author - 依頼する執筆者
 * @param submission - 依頼時に選んだ内容
 * @returns 経路。失敗した場合は理由
 */
export async function submitReviewRequest(
  postId: number,
  author: ReviewAccount,
  submission: ReviewSubmission,
): Promise<Outcome<ReviewRoute>> {
  const organization = await loadOrganizationOutcome();
  if (!organization.ok) {
    return organization;
  }
  const plan = planReviewRoute(organization.value, author.cuId, submission);
  if (!plan.ok) {
    return plan;
  }
  const divisionName = plan.value.divisionDn
    ? organization.value.divisions.find((division) => division.dn === plan.value.divisionDn)?.name ?? null
    : null;

  return await db.transaction(async (tx): Promise<Outcome<ReviewRoute>> => {
    const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
    if (!latest) {
      return { ok: false, error: '投稿が見つかりませんでした。' };
    }
    if (latest.publishedAt) {
      return { ok: false, error: '公開されていない変更がないため、依頼できません。' };
    }
    const current = await selectLatestReviewRequest(tx, postId, latest.identifier, true);
    if (current?.status === 'pending') {
      return { ok: false, error: '既に審査中です。' };
    }
    if (current?.status === 'approved') {
      return { ok: false, error: '既に承認されています。公開できます。' };
    }
    // eslint-disable-next-line unicorn/no-unused-array-method-return
    await tx.insert(postReviewRequestsTable).values({
      postId,
      postIdentifier: latest.identifier,
      requestedBy: author.id,
      route: plan.value.route,
      divisionDn: plan.value.divisionDn,
      divisionName,
      stage: 1,
      status: 'pending',
    });
    return { ok: true, value: plan.value.route };
  });
}


/**
 * 審査中の依頼を取り下げる（執筆者が行う）。
 *
 * @param postId - 投稿ID
 * @returns 処理の結果
 */
export async function withdrawReviewRequest(postId: number): Promise<Outcome> {
  return await db.transaction(async (tx): Promise<Outcome> => {
    const latest = await selectLatestPostContent(tx, postId, { forUpdate: true });
    if (!latest) {
      return { ok: false, error: '投稿が見つかりませんでした。' };
    }
    const current = await selectLatestReviewRequest(tx, postId, latest.identifier, true);
    if (current?.status !== 'pending') {
      return { ok: false, error: '取り下げる審査中の依頼がありません。' };
    }
    await tx
      .update(postReviewRequestsTable)
      .set({ status: 'withdrawn', closedAt: new Date() })
      .where(eq(postReviewRequestsTable.id, current.id));
    return { ok: true, value: null };
  });
}


/**
 * 依頼を承認または差し戻す。承認できるのは、現在の段階の承認者（LDAP の組織で判定）だけ。
 *
 * 通常の記事は、課長の承認の後に局長・執行委員の承認が必要。組織運営に関する記事は、会長・運営監査のいずれかの承認で完了する。
 *
 * @param requestId - 依頼ID
 * @param reviewer - 操作する利用者
 * @param input - 承認するかどうかと、コメント（差し戻す場合は必須）
 * @returns 処理の結果
 */
export async function reviewRequest(
  requestId: number,
  reviewer: ReviewAccount,
  input: { isApproved: boolean; comment: string },
): Promise<Outcome> {
  const comment = input.comment.trim();
  if (!input.isApproved && comment === '') {
    return { ok: false, error: '差し戻す場合は、修正してほしい内容をコメントに入力してください。' };
  }
  const context = await db
    .select({
      postId: postReviewRequestsTable.postId,
      authorCuId: usersTable.cuId,
    })
    .from(postReviewRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, postReviewRequestsTable.requestedBy))
    .where(eq(postReviewRequestsTable.id, requestId))
    .limit(1)
    .then((rows) => rows.at(0));
  if (!context) {
    return { ok: false, error: '依頼が見つかりませんでした。' };
  }
  const organization = await loadOrganizationOutcome();
  if (!organization.ok) {
    return organization;
  }

  return await db.transaction(async (tx): Promise<Outcome> => {
    // 投稿の内容の行を先にロックする（保存・公開・依頼と同じ順序にして、デッドロックと不整合を防ぐ）
    const latest = await selectLatestPostContent(tx, context.postId, { forUpdate: true });
    const request = await tx
      .select()
      .from(postReviewRequestsTable)
      .where(eq(postReviewRequestsTable.id, requestId))
      .for('update')
      .limit(1)
      .then((rows) => rows.at(0));
    if (!request || request.status !== 'pending') {
      return { ok: false, error: 'この依頼は審査中ではありません。' };
    }
    if (!latest || latest.publishedAt || latest.identifier !== request.postIdentifier) {
      return { ok: false, error: '審査中の内容が変わったため、この依頼は使えません。' };
    }

    const actions = await selectReviewActions(tx, requestId);
    const approverCuIds = actions.filter((action) => action.isApproved).map((action) => action.reviewerCuId);
    const eligible = getCurrentReviewers(organization.value, {
      route: request.route,
      stage: request.stage,
      authorCuId: context.authorCuId,
      divisionDn: request.divisionDn,
    }, approverCuIds);
    if (!eligible.some((person) => person.cuId === reviewer.cuId)) {
      return { ok: false, error: 'この依頼を審査できるのは、現在の段階の承認者だけです。' };
    }

    // eslint-disable-next-line unicorn/no-unused-array-method-return
    await tx.insert(postReviewActionsTable).values({
      requestId,
      stage: request.stage,
      reviewerCuId: reviewer.cuId,
      reviewerName: reviewer.name,
      isApproved: input.isApproved,
      comment: comment === '' ? null : comment,
    });

    if (!input.isApproved) {
      await tx
        .update(postReviewRequestsTable)
        .set({ status: 'rejected', closedAt: new Date() })
        .where(eq(postReviewRequestsTable.id, requestId));
    } else if (request.route === 'ordinary' && request.stage === 1) {
      await tx
        .update(postReviewRequestsTable)
        .set({ stage: 2 })
        .where(eq(postReviewRequestsTable.id, requestId));
    } else {
      await tx
        .update(postReviewRequestsTable)
        .set({ status: 'approved', closedAt: new Date() })
        .where(eq(postReviewRequestsTable.id, requestId));
    }
    return { ok: true, value: null };
  });
}


/**
 * 操作できる利用者の、審査中の依頼の一覧を取得する。
 *
 * @param account - 利用者
 * @returns 承認できる依頼の一覧（依頼日時の古い順）
 */
export async function selectPendingReviewsFor(account: ReviewAccount): Promise<Outcome<PendingReview[]>> {
  const organization = await loadOrganizationOutcome();
  if (!organization.ok) {
    return organization;
  }
  const rows = await db
    .select({
      request: postReviewRequestsTable,
      authorCuId: usersTable.cuId,
      authorName: usersTable.name,
      postTitle: postContentsTable.title,
    })
    .from(postReviewRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, postReviewRequestsTable.requestedBy))
    .innerJoin(postContentsTable, and(
      eq(postContentsTable.postId, postReviewRequestsTable.postId),
      eq(postContentsTable.identifier, postReviewRequestsTable.postIdentifier),
    ))
    .where(eq(postReviewRequestsTable.status, 'pending'))
    .orderBy(asc(postReviewRequestsTable.createdAt));

  const approvals = rows.length > 0
    ? await db
      .select({ requestId: postReviewActionsTable.requestId, reviewerCuId: postReviewActionsTable.reviewerCuId })
      .from(postReviewActionsTable)
      .where(and(
        inArray(postReviewActionsTable.requestId, rows.map((row) => row.request.id)),
        eq(postReviewActionsTable.isApproved, true),
      ))
    : [];

  const items: PendingReview[] = [];
  for (const row of rows) {
    const approverCuIds = approvals
      .filter((approval) => approval.requestId === row.request.id)
      .map((approval) => approval.reviewerCuId);
    const eligible = getCurrentReviewers(organization.value, {
      route: row.request.route,
      stage: row.request.stage,
      authorCuId: row.authorCuId,
      divisionDn: row.request.divisionDn,
    }, approverCuIds);
    if (eligible.some((person) => person.cuId === account.cuId)) {
      items.push({
        requestId: row.request.id,
        postTitle: row.postTitle,
        authorName: row.authorName,
        divisionName: row.request.divisionName,
        stageLabel: describeReviewStage(row.request.route, row.request.stage),
        requestedAt: row.request.createdAt,
      });
    }
  }
  return { ok: true, value: items };
}


/**
 * レビューの詳細（依頼の内容・操作の履歴・承認できるかどうか）を取得する。
 *
 * @param requestId - 依頼ID
 * @param account - 閲覧する利用者
 * @returns 詳細。依頼が見つからない場合は `null`
 */
export async function selectReviewDetail(
  requestId: number,
  account: ReviewAccount,
): Promise<Outcome<ReviewDetail | null>> {
  const row = await db
    .select({
      request: postReviewRequestsTable,
      authorCuId: usersTable.cuId,
      authorName: usersTable.name,
      postTitle: postContentsTable.title,
      postDescription: postContentsTable.description,
      postContent: postContentsTable.content,
    })
    .from(postReviewRequestsTable)
    .innerJoin(usersTable, eq(usersTable.id, postReviewRequestsTable.requestedBy))
    .innerJoin(postContentsTable, and(
      eq(postContentsTable.postId, postReviewRequestsTable.postId),
      eq(postContentsTable.identifier, postReviewRequestsTable.postIdentifier),
    ))
    .where(eq(postReviewRequestsTable.id, requestId))
    .limit(1)
    .then((rows) => rows.at(0));
  if (!row) {
    return { ok: true, value: null };
  }
  const organization = await loadOrganizationOutcome();
  if (!organization.ok) {
    return organization;
  }
  const actions = await selectReviewActions(db, requestId);
  const isPending = row.request.status === 'pending';
  const eligible = isPending
    ? getCurrentReviewers(organization.value, {
      route: row.request.route,
      stage: row.request.stage,
      authorCuId: row.authorCuId,
      divisionDn: row.request.divisionDn,
    }, actions.filter((action) => action.isApproved).map((action) => action.reviewerCuId))
    : [];
  return {
    ok: true,
    value: {
      request: toRequestView(row.request),
      authorName: row.authorName,
      postTitle: row.postTitle,
      postDescription: row.postDescription,
      postContent: row.postContent,
      actions,
      reviewerNames: eligible.map((person) => person.name),
      canReview: eligible.some((person) => person.cuId === account.cuId),
    },
  };
}
