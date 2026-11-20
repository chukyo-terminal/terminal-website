import type { NextConfig } from 'next';


export default {
  reactStrictMode: true,
  output: 'standalone',

  typescript: {
    ignoreBuildErrors: false,
  },

  images: {
    unoptimized: false,
  },

  experimental: {
    webpackBuildWorker: true,
    parallelServerBuildTraces: true,
    parallelServerCompiles: true,
    // 画像のアップロード（Server Action）で受け付けるリクエストの大きさの上限。
    // アップロードできるファイルの最大サイズ（`src/lib/images.ts` の `MAX_IMAGE_FILE_SIZE`、10MB）に、送信時の余白を加えた値にする
    serverActions: {
      bodySizeLimit: '11mb',
    },
    // Proxy（管理画面の認証）を通るリクエストは、この大きさまでしか読み込まれないため、Server Action の上限に合わせる
    proxyClientMaxBodySize: '11mb',
  },
} satisfies NextConfig;
