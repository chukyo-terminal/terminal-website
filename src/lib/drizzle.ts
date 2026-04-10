import { drizzle } from 'drizzle-orm/node-postgres';

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
  return column.getSQL().mapWith(column.mapFromDriverValue).as(alias);
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
