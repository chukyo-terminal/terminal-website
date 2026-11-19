import { PHASE_PRODUCTION_BUILD } from 'next/constants';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import type { AnyColumn, GetColumnData, SQL } from 'drizzle-orm';


/**
 * カラムにエイリアスを付けるためのユーティリティ関数。
 *
 * @param column - エイリアスを付けたいカラム。
 * @param alias - 付けたいエイリアス名。
 * @returns エイリアスが付与されたカラム。
 *
 * @see https://github.com/drizzle-team/drizzle-orm/issues/2391#issuecomment-2458053222
 */
export const as = <T extends AnyColumn>(
  column: T,
  alias: string,
): SQL.Aliased<GetColumnData<T>> => {
  // NOTE: `column.mapFromDriverValue` を関数として渡すと `this` がカラムを指さなくなり、
  //       `PgTimestamp` の `this.withTimezone` が undefined になってタイムゾーンが誤って解釈されるため、
  //       カラム自体をデコーダーとして渡す。
  return column.getSQL().mapWith(column).as(alias);
};



export const db = drizzle({
  connection: {
    user: process.env.DATABASE_USER!,
    password: process.env.DATABASE_PASSWORD!,
    host: process.env.DATABASE_HOST!,
    port: Number.parseInt(process.env.DATABASE_PORT!, 10),
    database: process.env.DATABASE_NAME!,
    ssl: process.env.DATABASE_SSL === 'true',
  },
  logger: process.env.NODE_ENV !== 'production' ? true : false,
});


/**
 * `globalThis` に実行中のマイグレーションを保存するキー。
 */
const MIGRATION_KEY = Symbol.for('terminal-website.database-migration');


/**
 * マイグレーションを開始する。
 *
 * @returns マイグレーションの完了を待つ Promise
 */
function startMigrations(): Promise<void> {
  console.log('Running database migrations...');
  return migrate(db, { migrationsFolder: 'drizzle' }).then(() => console.log('Database migrations completed.'));
}


// 本番環境で、起動時にマイグレーションを実行する。
// サーバーの起動時の処理（instrumentation）とページは別々にバンドルされ、このモジュールが複数回読み込まれるため、
// 同時に実行して競合しないよう、`globalThis` で共有して1回だけ実行する
/*
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== PHASE_PRODUCTION_BUILD) {
  const store = globalThis as unknown as Record<symbol, Promise<void> | undefined>;
  store[MIGRATION_KEY] ??= startMigrations();
  await store[MIGRATION_KEY];
}
*/
