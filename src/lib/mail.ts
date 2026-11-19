import { createTransport } from 'nodemailer';


/**
 * SMTP サーバーとの通信のタイムアウト（ms）。
 */
const SMTP_TIMEOUT = {
  connection: 10_000,
  greeting: 10_000,
  socket: 30_000,
} as const;


/**
 * 名前付きのメールアドレス。
 */
type MailAddress = {
  /** 名前（ない場合は空文字列） */
  name: string;
  address: string;
};


/**
 * メールの送信設定。
 */
type MailConfig = {
  host: string;
  port: number;
  /** 接続時から TLS を使用するかどうか（`false` の場合、サーバーが対応していれば STARTTLS で暗号化する） */
  secure: boolean;
  /** SMTP 認証の情報（認証しない場合は `undefined`） */
  auth: { user: string; pass: string } | undefined;
  /** 送信元 */
  from: MailAddress;
  /** 返信先（送信元と異なる場合のみ） */
  replyTo: MailAddress | undefined;
};


/**
 * `名前 <アドレス>` または `アドレス` の形式の文字列を、名前とアドレスに分ける。
 *
 * nodemailer に文字列のまま渡すと、名前の中の括弧がコメントとして扱われて消えるため、名前とアドレスを分けて渡す。
 *
 * @param value - 文字列（例: `Terminal (開発) <contact@example.com>`）
 * @returns 名前とアドレス
 */
function parseMailAddress(value: string): MailAddress {
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(value.trim());
  if (!match) {
    return { name: '', address: value.trim() };
  }
  // 名前を二重引用符で囲んでいる場合は、引用符を除く
  const name = match[1].trim().replace(/^"(.*)"$/, '$1');
  return { name, address: match[2].trim() };
}


/**
 * 環境変数からメールの送信設定を読み取る。
 *
 * - `SMTP_HOST`（必須）: SMTP サーバーのホスト名
 * - `SMTP_PORT`: ポート番号（省略した場合は `SMTP_SECURE` に応じて 465 または 587）
 * - `SMTP_SECURE`: `true` の場合、接続時から TLS を使用する
 * - `SMTP_USER`・`SMTP_PASSWORD`: SMTP 認証の情報（`SMTP_USER` を省略した場合は認証しない）
 * - `MAIL_FROM`（必須）: 送信元
 * - `MAIL_REPLY_TO`: 返信先
 *
 * @returns 送信設定。必須の環境変数が設定されていない場合は `null`
 */
function getMailConfig(): MailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!host || !from) {
    return null;
  }
  const secure = process.env.SMTP_SECURE === 'true';
  const port = Number.parseInt(process.env.SMTP_PORT ?? '', 10);
  const user = process.env.SMTP_USER?.trim();
  const replyTo = process.env.MAIL_REPLY_TO?.trim();
  return {
    host,
    port: Number.isSafeInteger(port) && port > 0 ? port : (secure ? 465 : 587),
    secure,
    auth: user ? { user, pass: process.env.SMTP_PASSWORD ?? '' } : undefined,
    from: parseMailAddress(from),
    replyTo: replyTo ? parseMailAddress(replyTo) : undefined,
  };
}


/**
 * メールを送信できるように設定されているかどうかを判定する。
 *
 * @returns 設定されている場合は `true`
 */
export function isMailConfigured(): boolean {
  return getMailConfig() !== null;
}


/**
 * 送信元のメールアドレスのドメインを返す（Message-ID の生成に使用する）。
 *
 * @returns ドメイン。送信設定がない場合や、送信元のアドレスを読み取れない場合は `localhost`
 */
export function getMailDomain(): string {
  const address = getMailConfig()?.from.address ?? '';
  return /@([\w.-]+)$/.exec(address)?.[1] ?? 'localhost';
}


/**
 * 送信元のメールアドレスを返す（受信したメールのうち、自分が送信したものを見分けるために使用する）。
 *
 * @returns 小文字にしたメールアドレス。送信設定がない場合は `null`
 */
export function getMailFromAddress(): string | null {
  return getMailConfig()?.from.address.toLowerCase() ?? null;
}


/**
 * 送信するメール。
 */
export type MailMessage = {
  to: { name: string; address: string };
  subject: string;
  /** 本文（プレーンテキスト） */
  text: string;
  /** Message-ID（山括弧を含む。省略した場合は自動で生成する） */
  messageId?: string;
  /** 返信元のメールの Message-ID */
  inReplyTo?: string;
  /** 同じスレッドの過去のメールの Message-ID */
  references?: string[];
};


/**
 * メールを送信する。
 *
 * @param message - 送信するメール
 * @throws 送信設定がない場合や、送信に失敗した場合
 */
export async function sendMail(message: MailMessage): Promise<void> {
  const config = getMailConfig();
  if (!config) {
    throw new Error('Mail is not configured. Set SMTP_HOST and MAIL_FROM.');
  }
  const transporter = createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
    connectionTimeout: SMTP_TIMEOUT.connection,
    greetingTimeout: SMTP_TIMEOUT.greeting,
    socketTimeout: SMTP_TIMEOUT.socket,
  });
  try {
    await transporter.sendMail({
      from: config.from,
      replyTo: config.replyTo,
      to: message.to,
      subject: message.subject,
      text: message.text,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
    });
  } finally {
    transporter.close();
  }
}
