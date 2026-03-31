import { sql } from 'drizzle-orm';
import { boolean, char, check, date, foreignKey, integer, pgEnum, pgTable, primaryKey, text, timestamp, varchar } from 'drizzle-orm/pg-core';


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
    /** スラッグ（数字，小文字の英字，ハイフン，かつ先頭と末尾にハイフンが含まれない） */
    slug: text().notNull().unique(),
    /** 非公開フラグ（未公開を意味しない） */
    isPrivate: boolean('is_private').notNull().default(false),
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
