import type { MetadataRoute } from 'next';


/**
 * robots.txtを生成する。
 * @returns robots.txt
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin/', '/contact/thanks'],
    },
    sitemap: undefined, // TODO: サイトマップを自動生成
  };
}
