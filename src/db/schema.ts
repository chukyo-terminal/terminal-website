import { and, asc, desc, eq, isNull, isNotNull, sql, ne } from 'drizzle-orm';
import {
  boolean, char, check, date, foreignKey, index, integer,
  pgEnum, pgTable, pgView, primaryKey, text, timestamp, unique, uuid, varchar,
} from 'drizzle-orm/pg-core';

import { as } from '@/lib/drizzle';


/**
 * ロールを定義する列挙型
 */
export const roleEnum = pgEnum('ROLE', [
  'ADMIN',
  'REVIEWER',
  'CONTRIBUTOR',
]);


/**
 * ユーザー情報テーブル
 *
 * 通常削除は行わず、`isActive` フラグを切り替えることでユーザーの有効/無効を管理する。
 * もしユーザーを物理削除すると、関連する投稿などが全て失われたり、そのユーザーのみがレビューを行なった投稿が非公開になったりする可能性がある。
 */
export const usersTable = pgTable(
  'users',
  {
    /** ユーザーID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** CU_ID */
    cuId: char('cu_id', { length: 7 }).notNull().unique(),
    /** 氏名 */
    name: text().notNull(),
    /** 表示名 */
    displayName: text('display_name'),
    /** メールアドレス (非m.mail) */
    email: varchar({ length: 254 }).unique(),
    /** ロール */
    roles: roleEnum('roles').array().notNull().default([]),
    /** 有効性フラグ */
    isActive: boolean('is_active').notNull().default(true),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    check('valid_cu_id', sql`${table.cuId} ~ '^[A-Z]\\d{5}[md\\d]$'`),
    check('valid_email', sql`${table.email} IS NULL OR (${table.email} ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' AND ${table.email} NOT LIKE '%@m.chukyo-u.ac.jp')`),
  ],
);


/**
 * 上級管理者テーブル
 */
export const sudoersTable = pgTable(
  'sudoers',
  {
    /** ユーザーID */
    id: integer().primaryKey().references(() => usersTable.id, { onDelete: 'cascade' }),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
);


/**
 * タグテーブル
 */
export const tagsTable = pgTable(
  'tags',
  {
    /** タグID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** タグ名 */
    name: text().notNull().unique(),
    /** スラッグ（数字，小文字の英字，ハイフン，かつ先頭と末尾にハイフンが含まれない） */
    slug: text().notNull().unique(),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    check('valid_slug', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);


/**
 * 投稿マスタテーブル
 */
export const postsTable = pgTable(
  'posts',
  {
    /** 投稿ID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** 著者 */
    authorId: integer('author_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    /** 公開年度 */
    year: integer(),
    /** スラッグ（数字，小文字の英字，ハイフン，かつ先頭と末尾にハイフンが含まれない） */
    slug: text().notNull(),
    /** 非公開フラグ（未公開を意味しない） */
    isPrivate: boolean('is_private').notNull().default(false),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    unique('posts_year_slug_unique').on(table.year, table.slug),
    check('valid_year', sql`${table.year} IS NULL OR ${table.year} >= 2025`),
    check('valid_slug', sql`${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`),
  ],
);


/**
 * 投稿タグ設定テーブル
 *
 * UPDATEは想定されない。
 */
export const postTagsTable = pgTable(
  'post_tags',
  {
    /** 投稿ID */
    postId: integer('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    /** タグID */
    tagId: integer('tag_id').notNull().references(() => tagsTable.id, { onDelete: 'cascade' }),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.tagId] }),
  ],
);


/**
 * 投稿内容テーブル
 */
export const postContentsTable = pgTable(
  'post_contents',
  {
    /** 投稿ID */
    postId: integer('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    /** 識別子 */
    identifier: integer().notNull().generatedAlwaysAsIdentity(),
    /** タイトル */
    title: text().notNull(),
    /** 概要 */
    description: text(),
    /** 本文（Markdown形式） */
    content: text().notNull(),
    /** 非公開フラグ（未公開を意味しない） */
    isPrivate: boolean('is_private').notNull().default(false),
    /** 公開日時 */
    publishedAt: timestamp('published_at', { mode: 'date', precision: 3, withTimezone: true }),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.identifier] }),
  ],
);


/**
 * 投稿レビューテーブル
 *
 * UPDATEは想定されない。
 */
export const postReviewsTable = pgTable(
  'post_reviews',
  {
    /** 投稿ID */
    postId: integer('post_id').notNull(),
    /** 識別子 */
    postIdentifier: integer('post_identifier').notNull(),
    /** レビュアー */
    reviewerId: integer('reviewer_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
    /** コメント */
    comment: text(),
    /** 承認フラグ */
    isApproved: boolean('is_approved').notNull().default(false),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.postId, table.postIdentifier],
      foreignColumns: [postContentsTable.postId, postContentsTable.identifier],
    }).onDelete('cascade'),
    primaryKey({ columns: [table.postId, table.postIdentifier, table.reviewerId] }),
    check('valid_review', sql`NOT (${table.isApproved} = false AND ${table.comment} IS NULL)`), // 承認されていない場合、コメントは必須
  ],
);


/**
 * 投稿評価テーブル
 *
 * 訪問者ごとに、記事を「良い」「良くない」の二段階で評価する。訪問者はCookieに保存した訪問者IDで識別する。
 */
export const postRatingsTable = pgTable(
  'post_ratings',
  {
    /** 投稿ID */
    postId: integer('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    /** 訪問者ID */
    visitorId: uuid('visitor_id').notNull(),
    /** 評価（`true` は良い、`false` は良くない） */
    isPositive: boolean('is_positive').notNull(),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.postId, table.visitorId] }),
  ],
);


/**
 * 投稿コメントテーブル
 *
 * 訪問者のコメントと、それに対する返信（訪問者・管理者）を保存する。
 * 記事に直接投稿されたコメントを起点とするスレッドで管理し、返信はスレッド内のどのコメントに対しても行える。
 *
 * - スレッドの起点のコメント: `threadId` と `parentId` が `null`（訪問者のみ投稿できる）
 * - 返信: `threadId` に起点のコメント、`parentId` に返信先のコメントを設定する（返信先が削除された場合は `parentId` が `null` になる）
 * - 訪問者のコメント: `visitorId` と `authorEmail` を設定し、`authorId` は `null`
 * - 管理者の返信: `authorId` を設定し、`visitorId`・`authorEmail`・`authorName` は `null`
 */
export const postCommentsTable = pgTable(
  'post_comments',
  {
    /** コメントID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** 投稿ID */
    postId: integer('post_id').notNull().references(() => postsTable.id, { onDelete: 'cascade' }),
    /** スレッドの起点のコメントID（起点のコメント自身は `null`） */
    threadId: integer('thread_id'),
    /** 返信先のコメントID（起点のコメントや、返信先が削除された返信は `null`） */
    parentId: integer('parent_id'),
    /** 管理者の返信の返信者（訪問者のコメントは `null`） */
    authorId: integer('author_id').references(() => usersTable.id, { onDelete: 'cascade' }),
    /** 訪問者の名前（未入力の場合や管理者の返信は `null`） */
    authorName: text('author_name'),
    /** 訪問者のメールアドレス（公開しない。管理者の返信は `null`） */
    authorEmail: varchar('author_email', { length: 254 }),
    /** 訪問者ID（管理者の返信は `null`） */
    visitorId: uuid('visitor_id'),
    /** 内容（プレーンテキスト） */
    content: text().notNull(),
    /** 非表示フラグ */
    isHidden: boolean('is_hidden').notNull().default(false),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    // 起点のコメントを削除すると、スレッド全体を削除する
    foreignKey({
      name: 'post_comments_thread_id_fk',
      columns: [table.threadId],
      foreignColumns: [table.id],
    }).onDelete('cascade'),
    // 返信先を削除しても、その返信は残す
    foreignKey({
      name: 'post_comments_parent_id_fk',
      columns: [table.parentId],
      foreignColumns: [table.id],
    }).onDelete('set null'),
    index('post_comments_post_id_index').on(table.postId),
    index('post_comments_thread_id_index').on(table.threadId),
    index('post_comments_parent_id_index').on(table.parentId),
    index('post_comments_visitor_id_index').on(table.visitorId, table.createdAt),
    // 返信先を持つのは返信のみ
    check('valid_comment_thread', sql`${table.threadId} IS NOT NULL OR ${table.parentId} IS NULL`),
    // 管理者はスレッドを作成できない（返信のみ）
    check('valid_comment_staff', sql`${table.authorId} IS NULL OR ${table.threadId} IS NOT NULL`),
    check('valid_comment_visitor', sql`(${table.authorId} IS NULL) = (${table.visitorId} IS NOT NULL)`),
    check('valid_comment_author_email', sql`(${table.authorId} IS NULL) = (${table.authorEmail} IS NOT NULL)`),
    check('valid_comment_author_name', sql`${table.authorId} IS NULL OR ${table.authorName} IS NULL`),
    check('valid_comment_email', sql`${table.authorEmail} IS NULL OR ${table.authorEmail} ~* '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'`),
  ],
);


/**
 * 活動実績テーブル
 */
export const achievementsTable = pgTable(
  'achievements',
  {
    /** 実績ID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** タイトル */
    title: text().notNull(),
    /** 説明 */
    description: text(),
    /** 関連投稿ID */
    postId: integer('post_id').references(() => postsTable.id, { onDelete: 'set null' }),
    /** 設定日 */
    date: date().notNull(),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    // 投稿IDが設定されていない場合は説明が必須
    check('valid_achievement', sql`(${table.postId} IS NOT NULL) OR (${table.description} IS NOT NULL)`),
  ],
);


/**
 * 問い合わせテーブル
 */
export const contactsTable = pgTable(
  'contacts',
  {
    /** 問い合わせID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** 名前 */
    name: text().notNull(),
    /** メールアドレス */
    email: varchar({ length: 254 }).notNull(),
    /** 件名 */
    subject: text().notNull(),
    /** 内容 */
    content: text().notNull(),
    /** 担当者 */
    assignedTo: integer('assigned_to').references(() => usersTable.id, { onDelete: 'set null' }),
    /** 完了日時 */
    completedAt: timestamp('completed_at', { mode: 'date', precision: 3, withTimezone: true }),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
);


/**
 * 問い合わせ返信テーブル
 */
export const contactRepliesTable = pgTable(
  'contact_replies',
  {
    /** 問い合わせ返信ID（自動生成連番） */
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    /** 問い合わせID */
    contactId: integer('contact_id').notNull().references(() => contactsTable.id, { onDelete: 'cascade' }),
    /** 返信者（null の場合は問い合わせを行ったユーザーであることを示す） */
    authorId: integer('author_id').references(() => usersTable.id, { onDelete: 'set null' }),
    /** 件名 */
    subject: text().notNull(),
    /** 内容 */
    content: text().notNull(),
    /** 作成日時 */
    createdAt: timestamp('created_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow(),
    /** 更新日時 */
    updatedAt: timestamp('updated_at', { mode: 'date', precision: 3, withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
);


/*
 * 公開済み投稿ビュー
 */
export const publishedPostsView = pgView('published_posts_view').as((qb) => {
  const tagJsonAgg = sql<{ name: string; slug: string }[]>`COALESCE(JSONB_AGG(JSONB_BUILD_OBJECT('name', ${tagsTable.name}, 'slug', ${tagsTable.slug})), '[]'::JSONB)`.as('tag_agg');
  const tagQuery = qb
    .select({ tags: tagJsonAgg })
    .from(postTagsTable)
    .innerJoin(tagsTable, eq(postTagsTable.tagId, tagsTable.id))
    .where(eq(postTagsTable.postId, postsTable.id))
    .as('tags');
  const originalPostContentQuery = qb
    .select({ publishedAt: postContentsTable.publishedAt })
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postsTable.id))
    .orderBy(asc(postContentsTable.identifier))
    .limit(1)
    .as('original_post_contents');
  const draftQuery = qb
    .select({ hasDraft: isNull(postContentsTable.publishedAt).as('has_draft') })
    .from(postContentsTable)
    .where(eq(postContentsTable.postId, postsTable.id))
    .orderBy(desc(postContentsTable.identifier))
    .limit(1)
    .as('draft_query');
  return (
    qb.selectDistinctOn([postsTable.id], {
      id: postsTable.id,
      slug: postsTable.slug,
      authorId: as(usersTable.id, 'author_id'),
      authorName: as(usersTable.name, 'author_name'),
      authorDisplayName: as(usersTable.displayName, 'author_display_name'),
      title: as(postContentsTable.title, 'title'), // XXX: asしないとDrizzle側でundefinedになる
      description: as(postContentsTable.description, 'description'), // XXX: asしないとDrizzle側でundefinedになる
      content: as(postContentsTable.content, 'content'),
      tags: tagQuery.tags,
      publishedAt: originalPostContentQuery.publishedAt,
      updatedAt: as(postContentsTable.publishedAt, 'updated_at'),
      hasDraft: draftQuery.hasDraft,
    })
      .from(postsTable)
      .innerJoin(usersTable, eq(postsTable.authorId, usersTable.id))
      .innerJoin(postContentsTable, eq(postsTable.id, postContentsTable.postId))
      .leftJoinLateral(tagQuery, sql`TRUE`)
      .leftJoinLateral(originalPostContentQuery, sql`TRUE`)
      .leftJoinLateral(draftQuery, sql`TRUE`)
      .where(and(
        ne(postsTable.isPrivate, true),
        ne(postContentsTable.isPrivate, true),
        isNotNull(postContentsTable.publishedAt),
      ))
      .orderBy(desc(postsTable.id), desc(postContentsTable.identifier))
  );
});
