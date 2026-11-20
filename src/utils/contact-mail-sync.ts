/**
 * 問い合わせ者からの返信メールを IMAP で受信し、お問い合わせのやり取りとして記録する。
 *
 * 管理者の返信メールには、お問い合わせを識別する Message-ID（`toContactMessageId`・`toReplyMessageId`）を付けている。
 * 問い合わせ者がそのメールに返信すると、返信メールの In-Reply-To・References にその Message-ID が含まれるため、
 * どのお問い合わせへの返信かを判別できる。判別できないメール（新しく送られてきたメールなど）は記録しない。
 *
 * メールボックスは読み取り専用で開き、既読などの変更は加えない。確認済みのメールは UID で記録する。
 */

import { eq, inArray } from 'drizzle-orm';
import { convert as convertHtmlToText } from 'html-to-text';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

import { contactRepliesTable, contactsTable, mailboxSyncStatesTable } from '@/db/schema';
import { normalizeContactContent, normalizeSingleLine, parseContactMessageId, splitQuotedText } from '@/utils/contact';
import { notifyContactReply } from '@/utils/contact-notification';
import { db } from '@/lib/drizzle';
import { getImapConfig, getMailboxKey } from '@/lib/imap';
import { getMailDomain, getMailFromAddress } from '@/lib/mail';

import type { ImapConfig } from '@/lib/imap';
import type { ActionResult } from '@/types';


/**
 * 初めて確認する場合（UIDVALIDITY が変わった場合を含む）に、さかのぼって確認する期間（ms）。
 */
const INITIAL_LOOKBACK = 30 * 24 * 60 * 60 * 1000;


/**
 * 記録する本文の最大文字数（超えた部分は省略する）。
 */
const RECEIVED_CONTENT_MAX_LENGTH = 50_000;


/**
 * 記録する件名の最大文字数。
 */
const RECEIVED_SUBJECT_MAX_LENGTH = 255;


/**
 * サーバーの起動後、初めて自動で確認するまでの時間（ms）。
 */
const POLLING_START_DELAY = 10_000;


/**
 * IMAP サーバーとの通信のタイムアウト（ms）。
 */
const IMAP_TIMEOUT = {
  connection: 15_000,
  greeting: 15_000,
  socket: 60_000,
} as const;


/**
 * 一度にデータベースで照会する Message-ID の数。
 */
const QUERY_CHUNK_SIZE = 500;


/**
 * 確認の結果。
 */
export type MailSyncResult = {
  /** 記録した返信の数 */
  imported: number;
};


/**
 * 受信メールの確認状況。
 */
export type MailSyncStatus = {
  lastSucceededAt: Date | null;
  lastFailedAt: Date | null;
  /** 最後に確認に失敗した理由（最後の確認に成功した場合は `null`） */
  lastError: string | null;
  /** 自動で確認する間隔（ms。`0` の場合は自動で確認しない） */
  pollInterval: number;
};


/**
 * 確認処理の状態（同時に複数の確認を行わないために使用する）。
 *
 * サーバーの起動時の処理（instrumentation）と Server Action は別々にバンドルされるため、`globalThis` で共有する。
 */
type SyncRuntime = {
  running: Promise<ActionResult<MailSyncResult>> | null;
  isPolling: boolean;
};


/**
 * `globalThis` に確認処理の状態を保存するキー。
 */
const RUNTIME_KEY = Symbol.for('terminal-website.contact-mail-sync');


/**
 * 確認処理の状態を返す。
 *
 * @returns 確認処理の状態
 */
function getRuntime(): SyncRuntime {
  const store = globalThis as unknown as Record<symbol, SyncRuntime | undefined>;
  store[RUNTIME_KEY] ??= { running: null, isPolling: false };
  return store[RUNTIME_KEY];
}


/**
 * メールのヘッダーから、山括弧で囲まれた Message-ID をすべて取り出す。
 *
 * @param value - ヘッダーの値
 * @returns Message-ID（山括弧を含む）
 */
const extractMessageIds = (value: string | undefined): string[] => value?.match(/<[^<>\s]+>/g) ?? [];


/**
 * IMAP で取得した生のヘッダーを、ヘッダー名（小文字）と値の組にする。
 *
 * @param raw - 生のヘッダー
 * @returns ヘッダー名と値
 */
function parseRawHeaders(raw: Buffer | undefined): Map<string, string> {
  const headers = new Map<string, string>();
  // 折り返された行をつなげる
  for (const line of (raw?.toString('utf8') ?? '').replaceAll(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator > 0) {
      const name = line.slice(0, separator).trim().toLowerCase();
      headers.set(name, `${headers.get(name) ?? ''} ${line.slice(separator + 1).trim()}`.trim());
    }
  }
  return headers;
}


/**
 * 受信したメールの本文をプレーンテキストで返す。
 *
 * mailparser は、添付ファイルなどと一緒に送られた HTML のみのメールの本文をテキストにしないため、その場合はここで変換する。
 *
 * @param parsed - mailparser で解析したメール
 * @returns 本文（本文がない場合は空文字列）
 */
function getPlainText(parsed: { text?: string; html?: string | false }): string {
  if (parsed.text?.trim() || typeof parsed.html !== 'string') {
    return parsed.text ?? '';
  }
  return convertHtmlToText(parsed.html, {
    // 送信者の改行を保つ
    wordwrap: false,
    selectors: [
      { selector: 'img', format: 'skip' },
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
    ],
  });
}


/**
 * 自動送信されたメール（不在通知など）であるかどうかを判定する。
 *
 * @param headers - ヘッダー（mailparser で解析したもの）
 * @returns 自動送信されたメールの場合は `true`
 */
function isAutomaticReply(headers: Map<string, unknown>): boolean {
  const autoSubmitted = String(headers.get('auto-submitted') ?? 'no').trim().toLowerCase();
  const precedence = String(headers.get('precedence') ?? '').trim().toLowerCase();
  return autoSubmitted !== 'no' || headers.has('x-autoreply') || headers.has('x-autorespond')
    || precedence === 'auto_reply';
}


/**
 * IMAP サーバーに接続できなかったことを表すエラーコード（imapflow のもの。Node.js の `ECONNREFUSED` などは別に判定する）。
 */
const CONNECTION_ERROR_CODES: ReadonlySet<string> = new Set([
  'CONNECT_TIMEOUT', 'GREETING_TIMEOUT', 'UPGRADE_TIMEOUT', 'ETIMEOUT', 'NoConnection', 'EConnectionClosed',
]);


/**
 * 確認に失敗した理由を、管理者に表示するメッセージにする。
 *
 * @param e - エラー
 * @param config - 接続設定
 * @returns メッセージ
 */
function describeError(e: unknown, config: ImapConfig): string {
  const error = (typeof e === 'object' && e !== null ? e : {}) as {
    authenticationFailed?: boolean;
    serverResponseCode?: string;
    code?: string;
    message?: string;
  };
  if (error.authenticationFailed) {
    return 'IMAP サーバーにログインできませんでした。ユーザー名とパスワードを確認してください。';
  }
  if (error.serverResponseCode === 'NONEXISTENT') {
    return `メールボックス「${config.mailbox}」が見つかりませんでした。`;
  }
  if (typeof error.code === 'string' && (CONNECTION_ERROR_CODES.has(error.code) || /^E[A-Z]+$/.test(error.code))) {
    return `IMAP サーバー（${config.host}:${config.port}）に接続できませんでした（${error.code}）。`;
  }
  if (typeof error.code === 'string' && /^ERR_(?:SSL|TLS)|CERT/.test(error.code)) {
    return `IMAP サーバーと TLS で通信できませんでした（${error.code}）。IMAP_SECURE と IMAP_PORT の設定を確認してください。`;
  }
  return `受信メールを確認できませんでした（${String(error.message ?? e).slice(0, 200)}）。`;
}


/**
 * 確認状況を保存する。
 *
 * @param mailboxKey - メールボックスを識別するキー
 * @param values - 保存する値
 */
async function saveState(
  mailboxKey: string,
  values: Partial<Omit<typeof mailboxSyncStatesTable.$inferInsert, 'mailboxKey'>>,
): Promise<void> {
  await db
    .insert(mailboxSyncStatesTable)
    .values({ mailboxKey, ...values })
    .onConflictDoUpdate({ target: mailboxSyncStatesTable.mailboxKey, set: values });
}


/**
 * 確認するメール（返信の候補）。
 */
type Candidate = {
  uid: number;
  /** 返信先のお問い合わせ */
  contactId: number;
};


/**
 * メールボックスを確認し、問い合わせ者からの返信を記録する。
 *
 * @param client - 接続済みの IMAP クライアント
 * @param config - 接続設定
 * @param mailboxKey - メールボックスを識別するキー
 * @returns 確認の結果
 */
async function syncMailbox(client: ImapFlow, config: ImapConfig, mailboxKey: string): Promise<MailSyncResult> {
  const mailbox = await client.mailboxOpen(config.mailbox, { readOnly: true });
  const uidValidity = Number(mailbox.uidValidity);
  const state = await db
    .select({ uidValidity: mailboxSyncStatesTable.uidValidity, lastUid: mailboxSyncStatesTable.lastUid })
    .from(mailboxSyncStatesTable)
    .where(eq(mailboxSyncStatesTable.mailboxKey, mailboxKey))
    .then((result) => result.at(0));
  const isContinued = state?.uidValidity === uidValidity;
  const lastUid = isContinued ? state.lastUid : 0;

  // 前回の続きから確認する。初めて確認する場合は、直近の一定期間のメールのみを確認する
  const uids = ((await client.search(
    isContinued ? { uid: `${lastUid + 1}:*` } : { since: new Date(Date.now() - INITIAL_LOOKBACK) },
    { uid: true },
  )) || [])
    // 「n:*」は、n より大きい UID がない場合も最後のメールを返すため、確認済みのものを除く
    .filter((uid) => uid > lastUid)
    .toSorted((a, b) => a - b);
  if (uids.length === 0) {
    await saveState(mailboxKey, { uidValidity, lastUid });
    return { imported: 0 };
  }

  // まずヘッダーだけを取得し、お問い合わせへの返信を絞り込む
  const domain = getMailDomain();
  const references: { uid: number; ids: string[] }[] = [];
  for await (const message of client.fetch(
    uids,
    { uid: true, headers: ['message-id', 'in-reply-to', 'references'] },
    { uid: true },
  )) {
    const headers = parseRawHeaders(message.headers);
    // このサイトが送信したメール（送信済みのメールの写しなど）は除く
    const ownId = extractMessageIds(headers.get('message-id')).at(0);
    if (ownId && parseContactMessageId(ownId, domain) !== null) {
      continue;
    }
    // 直近の返信先から順に調べる
    const ids = [
      ...extractMessageIds(headers.get('in-reply-to')),
      ...extractMessageIds(headers.get('references')).toReversed(),
    ];
    if (ids.length > 0) {
      references.push({ uid: message.uid, ids });
    }
  }

  // このサイトが生成した Message-ID に加え、記録済みの問い合わせ者のメールへの返信（続けて送られたメール）も対象とする
  const unknownIds = [...new Set(references.flatMap(({ ids }) => ids.filter((id) => (
    parseContactMessageId(id, domain) === null
  ))))];
  const contactIdByMessageId = new Map<string, number>();
  for (let index = 0; index < unknownIds.length; index += QUERY_CHUNK_SIZE) {
    const rows = await db
      .select({ messageId: contactRepliesTable.messageId, contactId: contactRepliesTable.contactId })
      .from(contactRepliesTable)
      .where(inArray(contactRepliesTable.messageId, unknownIds.slice(index, index + QUERY_CHUNK_SIZE)));
    for (const row of rows) {
      contactIdByMessageId.set(row.messageId ?? '', row.contactId);
    }
  }
  const candidates: Candidate[] = references.flatMap(({ uid, ids }) => {
    for (const id of ids) {
      const contactId = parseContactMessageId(id, domain) ?? contactIdByMessageId.get(id);
      if (contactId !== undefined) {
        return [{ uid, contactId }];
      }
    }
    return [];
  });

  const contacts = candidates.length === 0 ? [] : await db
    .select({ id: contactsTable.id, name: contactsTable.name, subject: contactsTable.subject })
    .from(contactsTable)
    .where(inArray(contactsTable.id, [...new Set(candidates.map((candidate) => candidate.contactId))]));
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const ownAddress = getMailFromAddress();

  let imported = 0;
  for (const { uid, contactId } of candidates) {
    // 削除されたお問い合わせへの返信は記録しない
    const contact = contactsById.get(contactId);
    if (!contact) {
      continue;
    }
    const message = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
    if (!message || !message.source) {
      continue;
    }
    let parsed;
    try {
      parsed = await simpleParser(message.source, { skipImageLinks: true, skipTextLinks: true, skipTextToHtml: true });
    } catch (e) {
      // 解析できないメールで確認が止まらないよう、そのメールは飛ばす
      console.warn(`Failed to parse mail (UID ${uid}):`, e);
      continue;
    }
    const fromAddress = parsed.from?.value[0]?.address?.toLowerCase() ?? null;
    // 自分が送信したメールや、不在通知などの自動送信されたメールは記録しない
    if ((ownAddress !== null && fromAddress === ownAddress) || isAutomaticReply(parsed.headers)) {
      continue;
    }

    const now = new Date();
    const internalDate = message.internalDate ? new Date(message.internalDate) : null;
    const receivedAt = internalDate ?? parsed.date ?? now;
    let content = normalizeContactContent(getPlainText(parsed));
    if (content.length > RECEIVED_CONTENT_MAX_LENGTH) {
      content = `${content.slice(0, RECEIVED_CONTENT_MAX_LENGTH)}\n\n（長すぎるため、以降を省略しました。全文はメールソフトで確認してください）`;
    }
    const values = {
      contactId,
      isFromInquirer: true,
      // Message-ID がないメールは、メールボックス内の位置で識別する
      messageId: parsed.messageId ?? `<imap-${uidValidity}-${uid}@${config.host}>`,
      fromAddress,
      // 署名の画像などの、本文に埋め込まれた画像は除く
      attachmentNames: parsed.attachments
        .filter((attachment) => !attachment.related)
        .map((attachment) => attachment.filename || '名前のないファイル'),
      subject: normalizeSingleLine(parsed.subject ?? '').slice(0, RECEIVED_SUBJECT_MAX_LENGTH) || '（件名なし）',
      content: content || '（本文なし）',
      createdAt: receivedAt > now ? now : receivedAt,
    };

    const isInserted = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(contactRepliesTable)
        .values(values)
        // 別の確認で既に記録した場合は何もしない
        .onConflictDoNothing({ target: contactRepliesTable.messageId })
        .returning({ id: contactRepliesTable.id });
      if (inserted.length === 0) {
        return false;
      }
      // 問い合わせ者から返信が届いた場合は、返信が必要になるため未完了に戻す
      await tx.update(contactsTable).set({ completedAt: null }).where(eq(contactsTable.id, contactId));
      return true;
    });
    if (isInserted) {
      imported++;
      await notifyContactReply({
        contactId,
        name: contact.name,
        contactSubject: contact.subject,
        content: splitQuotedText(values.content).body,
      });
    }
  }

  await saveState(mailboxKey, { uidValidity, lastUid: uids.at(-1) });
  return { imported };
}


/**
 * 受信メールを確認し、問い合わせ者からの返信を記録する。確認中に呼び出した場合は、実行中の確認の結果を返す。
 *
 * @returns 確認の結果。失敗した場合は、管理者に表示するメッセージ
 */
export function syncContactMail(): Promise<ActionResult<MailSyncResult>> {
  const runtime = getRuntime();
  runtime.running ??= (async (): Promise<ActionResult<MailSyncResult>> => {
    const config = getImapConfig();
    if (!config) {
      return { ok: false, error: '受信メールの設定（IMAP）がされていません。' };
    }
    const mailboxKey = getMailboxKey(config);
    const client = new ImapFlow({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.auth,
      logger: false,
      connectionTimeout: IMAP_TIMEOUT.connection,
      greetingTimeout: IMAP_TIMEOUT.greeting,
      socketTimeout: IMAP_TIMEOUT.socket,
    });
    // 通信中のエラーでプロセスが終了しないよう、エラーイベントを受け取る（エラーは各処理の失敗として扱う）
    client.on('error', (e: unknown) => console.warn('IMAP connection error:', e));
    try {
      await client.connect();
      const data = await syncMailbox(client, config, mailboxKey);
      await saveState(mailboxKey, { lastSucceededAt: new Date(), lastError: null });
      return { ok: true, data };
    } catch (e) {
      const error = describeError(e, config);
      try {
        await saveState(mailboxKey, { lastFailedAt: new Date(), lastError: error });
      } catch (e_) {
        console.error('Failed to save mailbox sync state:', e_);
      }
      return { ok: false, error };
    } finally {
      await client.logout().catch(() => client.close());
    }
  })().finally(() => {
    runtime.running = null;
  });
  return runtime.running;
}


/**
 * 受信メールの確認状況を取得する。
 *
 * @returns 確認状況。受信メールの設定がされていない場合は `null`
 */
export async function selectMailSyncStatus(): Promise<MailSyncStatus | null> {
  const config = getImapConfig();
  if (!config) {
    return null;
  }
  const state = await db
    .select({
      lastSucceededAt: mailboxSyncStatesTable.lastSucceededAt,
      lastFailedAt: mailboxSyncStatesTable.lastFailedAt,
      lastError: mailboxSyncStatesTable.lastError,
    })
    .from(mailboxSyncStatesTable)
    .where(eq(mailboxSyncStatesTable.mailboxKey, getMailboxKey(config)))
    .then((result) => result.at(0));
  return {
    lastSucceededAt: state?.lastSucceededAt ?? null,
    lastFailedAt: state?.lastFailedAt ?? null,
    lastError: state?.lastError ?? null,
    pollInterval: config.pollInterval,
  };
}


/**
 * 受信メールの自動確認を開始する（サーバーの起動時に1回呼び出す）。
 *
 * 受信メールの設定がされていない場合や、自動で確認する間隔が `0` の場合は何もしない。
 */
export function startContactMailPolling(): void {
  const config = getImapConfig();
  const runtime = getRuntime();
  if (!config || config.pollInterval === 0 || runtime.isPolling) {
    return;
  }
  runtime.isPolling = true;
  console.log(`Checking contact replies via IMAP every ${config.pollInterval / 1000} seconds.`);

  // 同じエラーを繰り返し出力しないよう、前回のエラーを覚えておく
  let previousError: string | null = null;
  const tick = async (): Promise<void> => {
    try {
      const result = await syncContactMail();
      if (result.ok) {
        if (previousError !== null) {
          console.log('Contact reply check recovered.');
        }
        if (result.data.imported > 0) {
          console.log(`Recorded ${result.data.imported} contact replies.`);
        }
        previousError = null;
      } else if (result.error !== previousError) {
        console.error('Contact reply check failed:', result.error);
        previousError = result.error;
      }
    } catch (e) {
      console.error('Contact reply check failed:', e);
    } finally {
      setTimeout(() => void tick(), config.pollInterval).unref();
    }
  };
  setTimeout(() => void tick(), POLLING_START_DELAY).unref();
}
