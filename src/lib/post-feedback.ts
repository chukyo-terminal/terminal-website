/**
 * 記事の評価・コメントに関する型とユーティリティ。
 *
 * サーバーとブラウザの両方で使用できるよう、データベースには依存しない。
 */

import { z } from 'zod';


/**
 * コメントの最大文字数。
 */
export const COMMENT_MAX_LENGTH = 2000;


/**
 * コメント投稿者の名前の最大文字数。
 */
export const COMMENT_AUTHOR_NAME_MAX_LENGTH = 50;


/**
 * コメント投稿者のメールアドレスの最大文字数。
 */
export const COMMENT_AUTHOR_EMAIL_MAX_LENGTH = 254;


/**
 * 名前が入力されていないコメントの表示名。
 */
export const ANONYMOUS_COMMENT_AUTHOR_NAME = '名無しさん';


/**
 * 評価・コメントの Turnstile ウィジェットのアクション名。
 *
 * サーバーでトークンを検証する際に、このウィジェットで発行されたトークンであることを確認する。
 */
export const POST_FEEDBACK_TURNSTILE_ACTION = 'post-feedback';


/**
 * Turnstile ウィジェットに設定する、記事を識別するデータを生成する。
 *
 * サーバーでトークンを検証する際に、その記事のページで発行されたトークンであることを確認する。
 *
 * @param postId - 投稿ID
 * @returns Turnstile の `cData`
 */
export const toPostFeedbackTurnstileCData = (postId: number): string => `post-${postId}`;


/**
 * 記事の評価（`positive` は良い、`negative` は良くない）。
 */
export type RatingValue = 'positive' | 'negative';


/**
 * 記事の評価の集計。
 */
export type RatingSummary = {
  positive: number;
  negative: number;
};


/**
 * 評価を変更した結果。
 */
export type RatingState = {
  summary: RatingSummary;
  /** 訪問者自身の評価（評価していない場合は `null`） */
  myRating: RatingValue | null;
};


/**
 * 公開ページに表示する、コメントの投稿者。
 */
export type PublicCommentAuthor =
  | {
    type: 'visitor';
    /** 訪問者が入力した名前（未入力の場合は `null`） */
    name: string | null;
  }
  | {
    type: 'staff';
    name: string;
    /** 記事の著者であるかどうか */
    isPostAuthor: boolean;
  };


/**
 * コメント管理ページに表示する、コメントの投稿者。
 */
export type ManagedCommentAuthor =
  | {
    type: 'visitor';
    name: string | null;
    /** メールアドレス（公開しない） */
    email: string;
    /** 訪問者ID（同じ訪問者のコメントを見分けるために使用する） */
    visitorId: string;
  }
  | {
    type: 'staff';
    id: number;
    name: string;
    isPostAuthor: boolean;
  };


/**
 * 返信先。返信先が削除された（公開ページでは、表示されていない）場合は `unavailable`。
 */
export type ReplyTarget<T extends object = object> = ({ id: number; authorName: string } & T) | 'unavailable';


/**
 * コメント（スレッドの起点のコメントと返信に共通する項目）。
 */
type CommentBase<A> = {
  id: number;
  author: A;
  content: string;
  createdAt: Date;
  /** 投稿後に編集されたかどうか */
  isEdited: boolean;
};


/**
 * 公開ページに表示する返信。
 */
export type PublicReply = CommentBase<PublicCommentAuthor> & {
  /** 返信先（スレッドの起点のコメントへの返信は `null`） */
  replyTo: ReplyTarget | null;
};


/**
 * 公開ページに表示する、スレッドの起点のコメント。
 */
export type PublicComment = CommentBase<PublicCommentAuthor> & {
  /** スレッド内の返信（古い順） */
  replies: PublicReply[];
};


/**
 * コメント管理ページに表示する返信。
 */
export type ManagedReply = CommentBase<ManagedCommentAuthor> & {
  isHidden: boolean;
  updatedAt: Date;
  /** 返信先（スレッドの起点のコメントへの返信は `null`） */
  replyTo: ReplyTarget<{ isHidden: boolean }> | null;
};


/**
 * コメント管理ページに表示する、スレッドの起点のコメント。
 */
export type ManagedComment = CommentBase<ManagedCommentAuthor> & {
  isHidden: boolean;
  updatedAt: Date;
  /** スレッド内の返信（古い順） */
  replies: ManagedReply[];
};


/**
 * 訪問者がコメントを投稿した結果。
 */
export type CommentPostResult = {
  /** 投稿後の、公開ページに表示するすべてのコメント */
  comments: PublicComment[];
  /** 投稿したコメントのID */
  postedId: number;
};


/**
 * コメントの投稿者の表示名を返す。
 *
 * @param author - 投稿者
 * @returns 表示名
 */
export const getCommentAuthorName = (author: PublicCommentAuthor | ManagedCommentAuthor): string => (
  author.name ?? ANONYMOUS_COMMENT_AUTHOR_NAME
);


/**
 * コメント・返信の本文を正規化する（改行コードを統一し、前後の空白を除く）。
 *
 * @param value - 本文
 * @returns 正規化した本文
 */
export const normalizeCommentContent = (value: string): string => value.replaceAll(/\r\n?/g, '\n').trim();


/**
 * コメント・返信の本文の検証スキーマ。
 */
const CommentContentSchema = z
  .string({ error: 'コメントを入力してください。' })
  .transform(normalizeCommentContent)
  .pipe(z
    .string()
    .min(1, 'コメントを入力してください。')
    .max(COMMENT_MAX_LENGTH, `コメントは${COMMENT_MAX_LENGTH}文字以内で入力してください。`));


/**
 * 訪問者のコメントの入力値。
 */
export type CommentFormValues = {
  /** 名前（任意） */
  authorName: string;
  /** メールアドレス（必須、公開しない） */
  authorEmail: string;
  content: string;
};


/**
 * 訪問者のコメントの検証スキーマ。名前が空の場合は `null` に変換する。
 */
export const CommentFormSchema = z.object({
  authorName: z
    .string({ error: '名前が正しくありません。' })
    .transform((value) => value.replaceAll(/\s+/g, ' ').trim())
    .pipe(z.string().max(
      COMMENT_AUTHOR_NAME_MAX_LENGTH,
      `名前は${COMMENT_AUTHOR_NAME_MAX_LENGTH}文字以内で入力してください。`,
    ))
    .transform((value) => value === '' ? null : value),
  authorEmail: z
    .string({ error: 'メールアドレスを入力してください。' })
    .trim()
    .min(1, 'メールアドレスを入力してください。')
    .max(COMMENT_AUTHOR_EMAIL_MAX_LENGTH, 'メールアドレスが長すぎます。')
    .pipe(z.email('メールアドレスの形式が正しくありません。')),
  content: CommentContentSchema,
});


/**
 * 管理者の返信の検証スキーマ。
 */
export const ReplyContentSchema = CommentContentSchema;


/**
 * コメントの投稿者を、公開ページに表示する形に変換する（メールアドレスなどを取り除く）。
 *
 * @param author - 投稿者
 * @returns 公開ページに表示する投稿者
 */
const toPublicAuthor = (author: ManagedCommentAuthor): PublicCommentAuthor => (author.type === 'visitor'
  ? { type: 'visitor', name: author.name }
  : { type: 'staff', name: author.name, isPostAuthor: author.isPostAuthor });


/**
 * 返信先を、公開ページに表示する形に変換する（非表示の返信先は `unavailable` とする）。
 *
 * @param target - 返信先
 * @returns 公開ページに表示する返信先
 */
function toPublicReplyTarget(target: ManagedReply['replyTo']): ReplyTarget | null {
  if (target === null || target === 'unavailable') {
    return target;
  }
  return target.isHidden ? 'unavailable' : { id: target.id, authorName: target.authorName };
}


/**
 * コメントを公開ページに表示する形に変換する。
 *
 * 非表示にしたスレッド・返信を除き、メールアドレスや訪問者IDなどの公開しない情報を取り除く。
 * 返信先が非表示の場合は、返信先を `unavailable` とする。
 *
 * @param comments - すべてのコメント
 * @returns 公開ページに表示するコメント
 */
export function toPublicComments(comments: readonly ManagedComment[]): PublicComment[] {
  return comments
    .filter((comment) => !comment.isHidden)
    .map((comment) => ({
      id: comment.id,
      author: toPublicAuthor(comment.author),
      content: comment.content,
      createdAt: comment.createdAt,
      isEdited: comment.isEdited,
      replies: comment.replies
        .filter((reply) => !reply.isHidden)
        .map((reply) => ({
          id: reply.id,
          author: toPublicAuthor(reply.author),
          content: reply.content,
          createdAt: reply.createdAt,
          isEdited: reply.isEdited,
          replyTo: toPublicReplyTarget(reply.replyTo),
        })),
    }));
}


/**
 * 公開ページに表示しているコメントの数を数える（返信を含む）。
 *
 * @param comments - 公開ページに表示するコメント
 * @returns コメントの数
 */
export const countPublicComments = (comments: readonly PublicComment[]): number => comments.reduce(
  (total, comment) => total + 1 + comment.replies.length,
  0,
);


/**
 * スレッドに返信が必要かどうかを判定する。
 *
 * 非表示にしていないスレッドで、表示中の最新のコメントが訪問者のものである場合に返信が必要とする。
 *
 * @param comment - スレッドの起点のコメント
 * @returns 返信が必要な場合は `true`
 */
export function needsReply(comment: ManagedComment): boolean {
  if (comment.isHidden) {
    return false;
  }
  const latest = comment.replies.findLast((reply) => !reply.isHidden) ?? comment;
  return latest.author.type === 'visitor';
}
