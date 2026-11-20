'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { RefObject } from 'react';


/**
 * Turnstile ウィジェットの描画オプション（使用するもののみ）。
 *
 * @see https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
 */
type TurnstileRenderOptions = {
  'sitekey': string;
  'action'?: string;
  'cData'?: string;
  'theme'?: 'auto' | 'light' | 'dark';
  'size'?: 'normal' | 'flexible' | 'compact';
  'language'?: string;
  'callback'?: (token: string) => void;
  'error-callback'?: (code: string) => boolean | void;
  'expired-callback'?: () => void;
  'unsupported-callback'?: () => void;
};


/**
 * Turnstile の JavaScript API（使用するもののみ）。
 */
type TurnstileApi = {
  render: (container: HTMLElement, options: TurnstileRenderOptions) => string | null | undefined;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};


declare global {
  var turnstile: TurnstileApi | undefined;
}


/**
 * 明示的に描画する場合の Turnstile のスクリプト。
 */
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';


/**
 * トークンの発行を待つ最大時間（ms）。
 */
const TOKEN_TIMEOUT = 30_000;


/**
 * スクリプトの読み込み処理（複数のウィジェットで共有する）。
 */
let scriptPromise: Promise<TurnstileApi> | null = null;


/**
 * Turnstile のスクリプトを読み込む。既に読み込まれている場合は、読み込み済みの API を返す。
 *
 * @returns Turnstile の API
 */
function loadTurnstile(): Promise<TurnstileApi> {
  if (globalThis.turnstile) {
    return Promise.resolve(globalThis.turnstile);
  }
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => {
      if (globalThis.turnstile) {
        resolve(globalThis.turnstile);
      } else {
        reject(new Error('Turnstile API is not available.'));
      }
    });
    script.addEventListener('error', () => {
      // 次回の呼び出しで読み込み直せるようにする
      scriptPromise = null;
      script.remove();
      reject(new Error('Failed to load Turnstile script.'));
    });
    document.head.append(script);
  });
  return scriptPromise;
}


/**
 * Turnstile ウィジェットの状態。
 *
 * - `loading`: トークンを発行中
 * - `ready`: トークンを発行済み
 * - `error`: トークンを発行できない（自動で再試行される）
 */
export type TurnstileStatus = 'loading' | 'ready' | 'error';


/**
 * トークンの発行を待っている処理。
 */
type TokenWaiter = {
  resolve: (token: string) => void;
  reject: (error: Error) => void;
};


/**
 * Turnstile ウィジェットを明示的に描画し、送信ごとに新しいトークンを取り出せるようにする。
 *
 * トークンは1回しか使えないため、`takeToken` で取り出すと、ウィジェットをリセットして次のトークンを発行する。
 * ウィジェットのモード（Non-interactive など）はサイトキーごとに Cloudflare のダッシュボードで設定する。
 *
 * @param options - サイトキー、アクション名、`cData`
 * @returns ウィジェットを描画する要素の参照、状態、トークンを取り出す関数
 */
export function useTurnstile({ siteKey, action, cData }: {
  siteKey: string;
  action: string;
  cData: string;
}): {
  containerRef: RefObject<HTMLDivElement | null>;
  status: TurnstileStatus;
  takeToken: () => Promise<string>;
} {
  const containerReference = useRef<HTMLDivElement>(null);
  const widgetIdReference = useRef<string | null>(null);
  const tokenReference = useRef<string | null>(null);
  const waitersReference = useRef<TokenWaiter[]>([]);
  const [status, setStatus] = useState<TurnstileStatus>('loading');

  /**
   * 次のトークンを発行するため、ウィジェットをリセットする。
   */
  const resetWidget = useCallback((): void => {
    const widgetId = widgetIdReference.current;
    tokenReference.current = null;
    setStatus('loading');
    if (widgetId !== null) {
      // コールバックの中から呼び出された場合に備えて、現在の処理が終わってからリセットする
      setTimeout(() => globalThis.turnstile?.reset(widgetId), 0);
    }
  }, []);

  useEffect(() => {
    let isDisposed = false;
    const waiters = waitersReference.current;

    /**
     * トークンの発行を待っている処理をすべて失敗させる。
     *
     * @param message - エラーメッセージ
     */
    const rejectAll = (message: string): void => {
      for (const waiter of waiters.splice(0)) {
        waiter.reject(new Error(message));
      }
    };

    loadTurnstile()
      .then((api) => {
        const container = containerReference.current;
        if (isDisposed || !container) {
          return;
        }
        widgetIdReference.current = api.render(container, {
          'sitekey': siteKey,
          action,
          cData,
          'theme': 'dark',
          'size': 'flexible',
          'language': 'ja',
          'callback': (token) => {
            const waiter = waiters.shift();
            if (waiter) {
              // トークンを待っている処理があれば渡し、次のトークンを発行する
              waiter.resolve(token);
              resetWidget();
            } else {
              tokenReference.current = token;
              setStatus('ready');
            }
          },
          'error-callback': (code) => {
            console.error('Turnstile error:', code);
            tokenReference.current = null;
            setStatus('error');
            rejectAll('Turnstile error');
            // エラーを処理したことを Turnstile に伝える（自動で再試行される）
            return true;
          },
          'expired-callback': () => {
            // 有効期限が切れたトークンは自動で再発行される
            tokenReference.current = null;
            setStatus('loading');
          },
          'unsupported-callback': () => {
            setStatus('error');
            rejectAll('Turnstile is not supported');
          },
        }) ?? null;
      })
      .catch((e: unknown) => {
        console.error(e);
        if (!isDisposed) {
          setStatus('error');
          rejectAll('Failed to load Turnstile');
        }
      });

    return () => {
      isDisposed = true;
      rejectAll('Turnstile widget was removed');
      if (widgetIdReference.current !== null) {
        globalThis.turnstile?.remove(widgetIdReference.current);
        widgetIdReference.current = null;
      }
      tokenReference.current = null;
    };
  }, [siteKey, action, cData, resetWidget]);

  const takeToken = useCallback((): Promise<string> => {
    const token = tokenReference.current;
    if (token) {
      resetWidget();
      return Promise.resolve(token);
    }
    return new Promise<string>((resolve, reject) => {
      const waiter: TokenWaiter = {
        resolve: (value) => {
          clearTimeout(timeoutId);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
      };
      const timeoutId = setTimeout(() => {
        const index = waitersReference.current.indexOf(waiter);
        if (index !== -1) {
          waitersReference.current.splice(index, 1);
        }
        reject(new Error('Turnstile token timeout'));
      }, TOKEN_TIMEOUT);
      waitersReference.current.push(waiter);
    });
  }, [resetWidget]);

  return { containerRef: containerReference, status, takeToken };
}
