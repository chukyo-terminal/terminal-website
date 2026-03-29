import { sql } from 'drizzle-orm';
import { boolean, char, check, integer, pgEnum, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core';


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
