import { Valkey } from 'iovalkey';


/**
 * キーの接頭辞（同じ Valkey を他のアプリと共有してもキーが衝突しないようにする）。
 */
const KEY_PREFIX = 'terminal-website:';


/**
 * `globalThis` に接続を保存するキー。
 *
 * 開発時のホットリロードや、ページと instrumentation が別々にバンドルされることでモジュールが複数回読み込まれても、
 * 接続を1つだけにする。
 */
const CLIENT_KEY = Symbol.for('terminal-website.valkey-client');


/**
 * Valkey に接続できるように設定されているかどうかを判定する。
 *
 * @returns `VALKEY_URL` が設定されている場合は `true`
 */
export function isValkeyConfigured(): boolean {
  return Boolean(process.env.VALKEY_URL?.trim());
}


/**
 * Valkey の接続を返す。初めて呼び出したときに接続する。
 *
 * 接続先は `VALKEY_URL`（例: `valkey://valkey:6379/0`、TLS を使用する場合は `valkeys://`）で指定する。
 * `redis://`・`rediss://` の形式も使用できる。
 *
 * @returns Valkey の接続
 * @throws `VALKEY_URL` が設定されていない場合
 */
export function getValkey(): Valkey {
  const store = globalThis as unknown as Record<symbol, Valkey | undefined>;
  const existing = store[CLIENT_KEY];
  if (existing) {
    return existing;
  }
  const url = process.env.VALKEY_URL?.trim();
  if (!url) {
    throw new Error('Valkey is not configured. Set VALKEY_URL.');
  }
  const client = new Valkey(url, {
    keyPrefix: KEY_PREFIX,
    connectTimeout: 10_000,
    // Valkey に接続できない場合に、リクエストがいつまでも待たされないようにする
    commandTimeout: 5000,
    maxRetriesPerRequest: 2,
  });
  // 接続が切れた場合などのエラーを記録する（再接続は自動で行われる）
  client.on('error', (e: unknown) => console.error('Valkey error:', e));
  store[CLIENT_KEY] = client;
  return client;
}
