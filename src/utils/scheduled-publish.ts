import { and, asc, isNull, lte } from 'drizzle-orm';

import { postContentsTable } from '@/db/schema';
import { db } from '@/lib/drizzle';
import { publishPostVersion } from '@/utils/post-publish';


/**
 * 公開予約を確認する既定の間隔（秒）。
 */
const DEFAULT_CHECK_INTERVAL = 60;


/**
 * 公開予約の確認処理の状態（同時に複数の確認を行わないために使用する）。
 */
type SchedulerRuntime = {
  isRunning: boolean;
  timer: ReturnType<typeof setInterval> | null;
};


/**
 * `globalThis` に確認処理の状態を保存するキー。
 *
 * サーバーの起動時の処理（instrumentation）と Server Action は別々にバンドルされるため、`globalThis` で共有する。
 */
const RUNTIME_KEY = Symbol.for('terminal-website.scheduled-publish');


/**
 * 確認処理の状態を返す。
 *
 * @returns 確認処理の状態
 */
function getRuntime(): SchedulerRuntime {
  const store = globalThis as unknown as Record<symbol, SchedulerRuntime | undefined>;
  store[RUNTIME_KEY] ??= { isRunning: false, timer: null };
  return store[RUNTIME_KEY];
}


/**
 * 公開予約を確認する間隔（ms）を環境変数から読み取る。
 *
 * - `SCHEDULED_PUBLISH_INTERVAL`: 確認する間隔（秒。省略した場合は 60、`0` の場合は自動で確認しない）
 *
 * @returns 間隔（ms）。`0` の場合は自動で確認しない
 */
export function getScheduledPublishInterval(): number {
  const seconds = Number.parseInt(process.env.SCHEDULED_PUBLISH_INTERVAL ?? '', 10);
  return 1000 * (Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : DEFAULT_CHECK_INTERVAL);
}


/**
 * 公開予約の日時を過ぎた版を公開する。
 *
 * 公開予約の時刻を公開日時として記録する（サーバーが停止していた場合も、起動後に公開する）。
 * 行ロックを `SKIP LOCKED` で取得するため、複数のサーバーで同時に実行しても同じ版を二重に公開しない。
 *
 * @param now - 基準日時
 * @returns 公開した版の数
 */
export async function publishDueScheduledPosts(now: Date = new Date()): Promise<number> {
  return await db.transaction(async (tx) => {
    const dueVersions = await tx
      .select({
        postId: postContentsTable.postId,
        identifier: postContentsTable.identifier,
        scheduledPublishAt: postContentsTable.scheduledPublishAt,
      })
      .from(postContentsTable)
      .where(and(isNull(postContentsTable.publishedAt), lte(postContentsTable.scheduledPublishAt, now)))
      .orderBy(asc(postContentsTable.scheduledPublishAt))
      .for('update', { skipLocked: true });

    for (const version of dueVersions) {
      // 条件により公開予約の日時は必ず設定されている
      await publishPostVersion(tx, version.postId, version.identifier, version.scheduledPublishAt!);
    }
    return dueVersions.length;
  });
}


/**
 * 公開予約の確認を1回行う。失敗した場合はログに記録し、次の確認で再試行する。
 *
 * @param runtime - 確認処理の状態
 */
async function checkOnce(runtime: SchedulerRuntime): Promise<void> {
  if (runtime.isRunning) {
    return;
  }
  runtime.isRunning = true;
  try {
    const count = await publishDueScheduledPosts();
    if (count > 0) {
      console.log(`Published ${count} scheduled post version(s).`);
    }
  } catch (e) {
    console.error('Failed to publish scheduled posts:', e);
  } finally {
    runtime.isRunning = false;
  }
}


/**
 * 公開予約の自動確認を開始する（サーバーの起動時に1回だけ呼び出す）。
 *
 * 間隔が `0` の場合は開始しない（その場合、公開予約の時刻を過ぎても自動では公開されない）。
 */
export function startScheduledPublishing(): void {
  const interval = getScheduledPublishInterval();
  const runtime = getRuntime();
  if (interval === 0 || runtime.timer) {
    return;
  }
  void checkOnce(runtime);
  runtime.timer = setInterval(() => void checkOnce(runtime), interval);
}
