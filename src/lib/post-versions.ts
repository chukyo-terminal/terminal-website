/**
 * 記事の版（編集履歴）に関する型とユーティリティ。
 *
 * 記事の内容は `post_contents` テーブルに版ごとに保存される。公開済みの版は書き換えず、編集すると新しい版（下書き）が追加される。
 * サーバーとブラウザの両方で使用できるよう、データベースには依存しない。
 */


/**
 * 記事の版。
 */
export type PostVersion = {
  /** 版の識別子（`post_contents.identifier`。全記事で一意） */
  identifier: number;
  /**
   * 版番号（公開された順に1から数える。未公開の版（下書き）は `null`）。
   *
   * 非公開にした版も数えるため、版を非公開にしても他の版の番号は変わらない。
   */
  number: number | null;
  title: string;
  description: string | null;
  content: string;
  /** 版ごとの非公開フラグ */
  isPrivate: boolean;
  /** 公開日時（未公開の版は `null`） */
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};


/**
 * 公開された版（非公開にした版を含む）。
 */
export type PublishedPostVersion = PostVersion & { number: number; publishedAt: Date };


/**
 * 版が公開されたものかどうかを判定する（非公開にした版を含む）。
 *
 * @param version - 版
 * @returns 公開された版であれば `true`
 */
export function isPublishedVersion(version: PostVersion): version is PublishedPostVersion {
  return version.publishedAt !== null && version.number !== null;
}


/**
 * 版が公開ページに表示できるものかどうかを判定する（公開済みで、非公開にしていない）。
 *
 * @param version - 版
 * @returns 表示できる版であれば `true`
 */
export function isPublicVersion(version: PostVersion): version is PublishedPostVersion {
  return isPublishedVersion(version) && !version.isPrivate;
}


/**
 * 識別子の昇順に並んだ版に、版番号を付ける。
 *
 * @param rows - 識別子の昇順に並んだ版
 * @returns 版番号を付けた版
 */
export function numberPostVersions(rows: readonly Omit<PostVersion, 'number'>[]): PostVersion[] {
  let number = 0;
  return rows.map((row) => ({ ...row, number: row.publishedAt ? ++number : null }));
}


/**
 * 公開ページに表示されている版（表示できる版のうち最新のもの）を返す。
 *
 * @param versions - 識別子の昇順に並んだ版
 * @returns 表示されている版。表示できる版がない場合は `undefined`
 */
export function findDisplayedVersion(versions: readonly PostVersion[]): PublishedPostVersion | undefined {
  return versions.findLast((version) => isPublicVersion(version));
}


/**
 * 版の表示名を返す。
 *
 * @param version - 版
 * @returns 表示名（例: `第3版`、`下書き`）
 */
export function getVersionLabel(version: Pick<PostVersion, 'number'>): string {
  return version.number === null ? '下書き' : `第${version.number}版`;
}
