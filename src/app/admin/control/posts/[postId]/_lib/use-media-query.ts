import { useCallback, useSyncExternalStore } from 'react';


/**
 * メディアクエリに一致するかどうかを返す。
 *
 * @param query - メディアクエリ（例: `(min-width: 768px)`）
 * @param serverValue - サーバーでのレンダリング時（およびハイドレーション時）に返す値
 * @returns メディアクエリに一致する場合は `true`
 */
export function useMediaQuery(query: string, serverValue: boolean): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const mediaQueryList = globalThis.matchMedia(query);
    mediaQueryList.addEventListener('change', onChange);
    return () => mediaQueryList.removeEventListener('change', onChange);
  }, [query]);
  return useSyncExternalStore(
    subscribe,
    () => globalThis.matchMedia(query).matches,
    () => serverValue,
  );
}
