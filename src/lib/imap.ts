/**
 * 受信メールの自動確認の既定の間隔（秒）。
 */
const DEFAULT_POLL_INTERVAL = 60;


/**
 * IMAP の接続設定。
 */
export type ImapConfig = {
  host: string;
  port: number;
  /** 接続時から TLS を使用するかどうか（`false` の場合、サーバーが対応していれば STARTTLS で暗号化する） */
  secure: boolean;
  auth: { user: string; pass: string };
  /** 確認するメールボックス */
  mailbox: string;
  /** 受信メールを自動で確認する間隔（ms）。`0` の場合は自動で確認しない */
  pollInterval: number;
};


/**
 * 環境変数から IMAP の接続設定を読み取る。
 *
 * - `IMAP_HOST`（必須）: IMAP サーバーのホスト名
 * - `IMAP_PORT`: ポート番号（省略した場合は `IMAP_SECURE` に応じて 993 または 143）
 * - `IMAP_SECURE`: `false` の場合、接続時には TLS を使用しない（省略した場合は使用する）
 * - `IMAP_USER`（必須）・`IMAP_PASSWORD`: ログインの情報
 * - `IMAP_MAILBOX`: 確認するメールボックス（省略した場合は `INBOX`）
 * - `IMAP_POLL_INTERVAL`: 自動で確認する間隔（秒。省略した場合は 60、`0` の場合は自動で確認しない）
 *
 * @returns 接続設定。必須の環境変数が設定されていない場合は `null`
 */
export function getImapConfig(): ImapConfig | null {
  const host = process.env.IMAP_HOST?.trim();
  const user = process.env.IMAP_USER?.trim();
  if (!host || !user) {
    return null;
  }
  const secure = process.env.IMAP_SECURE !== 'false';
  const port = Number.parseInt(process.env.IMAP_PORT ?? '', 10);
  const pollIntervalSeconds = Number.parseInt(process.env.IMAP_POLL_INTERVAL ?? '', 10);
  return {
    host,
    port: Number.isSafeInteger(port) && port > 0 ? port : (secure ? 993 : 143),
    secure,
    auth: { user, pass: process.env.IMAP_PASSWORD ?? '' },
    mailbox: process.env.IMAP_MAILBOX?.trim() || 'INBOX',
    pollInterval: 1000 * (Number.isSafeInteger(pollIntervalSeconds) && pollIntervalSeconds >= 0
      ? pollIntervalSeconds
      : DEFAULT_POLL_INTERVAL),
  };
}


/**
 * 受信メールを確認できるように設定されているかどうかを判定する。
 *
 * @returns 設定されている場合は `true`
 */
export function isImapConfigured(): boolean {
  return getImapConfig() !== null;
}


/**
 * メールボックスを識別するキーを返す（確認済みのメールを記録するために使用する）。
 *
 * 接続先やメールボックスを変更した場合は別のキーになり、変更後のメールボックスを確認し直す。
 *
 * @param config - 接続設定
 * @returns キー（例: `contact@example.com@imap.example.com:993/INBOX`）
 */
export const getMailboxKey = (config: ImapConfig): string => (
  `${config.auth.user}@${config.host}:${config.port}/${config.mailbox}`
);
