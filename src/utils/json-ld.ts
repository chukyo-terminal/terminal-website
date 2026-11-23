/**
 * 検索エンジン向けの構造化データ（JSON-LD）を生成する処理。
 *
 * @see https://schema.org/
 * @see https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data
 */


/**
 * JSON-LD のノード（schema.org の型のデータ）。
 */
export type JsonLdNode = {
  '@type': string;
  '@id'?: string;
  [property: string]: unknown;
};


/**
 * パンくずリストの項目。
 */
export type BreadcrumbItem = {
  name: string;
  /** サイト内のパス */
  path: string;
};


/**
 * 記事の構造化データの元になる情報。
 */
export type BlogPostingSource = {
  /** 記事のパス */
  path: string;
  title: string;
  description: string | null;
  authorName: string;
  /** 初めて公開された日時 */
  publishedAt: Date;
  /** 表示している版の公開日時 */
  updatedAt: Date;
  /** タグの名前 */
  tags: string[];
  /** 本文に含まれる画像の URL（相対 URL の場合は、記事の URL を基準に解決する） */
  imageSources: string[];
};


/**
 * よくある質問の構造化データの元になる情報。
 */
export type FaqPageSource = {
  /** ページのパス */
  path: string;
  /** 質問と回答（ページに表示する順に並べる） */
  faqs: {
    /** ページ内で質問を指すフラグメント（`#` を除く） */
    fragment: string;
    question: string;
    /** 回答の HTML（Google は見出し・段落・リスト・リンク・強調などのタグを解釈し、それ以外は無視する） */
    answerHtml: string;
  }[];
};


/**
 * サークルの正式名称（会則第一条）。
 */
const ORGANIZATION_NAME = '中京大学プログラミングサークルTerminal';


/**
 * サークルの英語名称と略称（会則第一条）。
 */
const ORGANIZATION_ALTERNATE_NAMES = ['Chukyo University Terminal', '中京大学Terminal', 'CuT'];


/**
 * サイトの名前（検索結果に表示されるサイト名の候補）。
 *
 * 「Terminal」だけでは一般的な語と区別しにくいため、会則で定める略称を使用する。
 */
const SITE_NAME = '中京大学Terminal';


/**
 * サークルが運営するアカウントなどのプロフィールの URL。
 */
const ORGANIZATION_PROFILE_URLS = [
  'https://x.com/chukyo_terminal',
  'https://github.com/chukyo-terminal',
];


/**
 * サイト内のパスを絶対 URL に変換する。
 *
 * @param siteUrl - サイトの URL
 * @param path - サイト内のパス
 * @returns 絶対 URL
 */
const toAbsoluteUrl = (siteUrl: URL, path: string): string => new URL(path, siteUrl).href;


/**
 * サークル（組織）のノードの ID を返す。
 *
 * @param siteUrl - サイトの URL
 * @returns ノードの ID
 */
const getOrganizationId = (siteUrl: URL): string => `${toAbsoluteUrl(siteUrl, '/')}#organization`;


/**
 * 画像の URL を絶対 URL に変換する。
 *
 * HTTP(S) 以外の URL（`data:` など）と、重複した URL は除く。
 *
 * @param sources - 画像の URL
 * @param baseUrl - 相対 URL の基準にする URL
 * @returns 絶対 URL
 */
function toImageUrls(sources: string[], baseUrl: string): string[] {
  const urls = sources.flatMap((source) => {
    try {
      const url = new URL(source, baseUrl);
      return url.protocol === 'https:' || url.protocol === 'http:' ? [url.href] : [];
    } catch {
      return [];
    }
  });
  return [...new Set(urls)];
}


/**
 * サークル（組織）の基本的な情報だけを含むノードを生成する。
 *
 * 記事の発行者など、他のノードの中で組織を示す場合に使用する。
 *
 * @param siteUrl - サイトの URL
 * @returns `Organization` のノード
 */
const toOrganizationSummary = (siteUrl: URL): JsonLdNode => ({
  '@type': 'Organization',
  '@id': getOrganizationId(siteUrl),
  name: ORGANIZATION_NAME,
  url: toAbsoluteUrl(siteUrl, '/'),
  logo: toAbsoluteUrl(siteUrl, '/logo.svg'),
});


/**
 * サークル（組織）のノードを生成する。
 *
 * @param siteUrl - サイトの URL
 * @returns `Organization` のノード
 */
export function toOrganization(siteUrl: URL): JsonLdNode {
  return {
    ...toOrganizationSummary(siteUrl),
    alternateName: ORGANIZATION_ALTERNATE_NAMES,
    description: 'プログラミングに興味を持つ学生が集まる中京大学の学生団体です。',
    parentOrganization: {
      '@type': 'CollegeOrUniversity',
      name: '中京大学',
      url: 'https://www.chukyo-u.ac.jp/',
    },
    // 本部の所在地（会則第五条）
    location: {
      '@type': 'Place',
      name: '中京大学 豊田キャンパス 11号館4階',
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'JP',
        addressRegion: '愛知県',
        addressLocality: '豊田市',
        streetAddress: '貝津町床立101',
      },
    },
    sameAs: ORGANIZATION_PROFILE_URLS,
  };
}


/**
 * サイトのノードを生成する。
 *
 * 運営者は、同じドキュメントに含める `Organization` のノードを ID で参照する。
 *
 * @param siteUrl - サイトの URL
 * @returns `WebSite` のノード
 */
export function toWebsite(siteUrl: URL): JsonLdNode {
  const url = toAbsoluteUrl(siteUrl, '/');
  return {
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name: SITE_NAME,
    alternateName: [ORGANIZATION_NAME, ...ORGANIZATION_ALTERNATE_NAMES.filter((name) => name !== SITE_NAME)],
    url,
    inLanguage: 'ja',
    publisher: { '@id': getOrganizationId(siteUrl) },
  };
}


/**
 * パンくずリストのノードを生成する。
 *
 * 先頭には、トップページを自動で追加する。
 *
 * @param siteUrl - サイトの URL
 * @param items - トップページより下の階層の項目（上の階層から順に並べる）
 * @returns `BreadcrumbList` のノード
 */
export function toBreadcrumbList(siteUrl: URL, items: BreadcrumbItem[]): JsonLdNode {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'ホーム', path: '/' }, ...items].map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: toAbsoluteUrl(siteUrl, item.path),
    })),
  };
}


/**
 * 記事のノードを生成する。
 *
 * @param siteUrl - サイトの URL
 * @param post - 記事の情報
 * @returns `BlogPosting` のノード
 */
export function toBlogPosting(siteUrl: URL, post: BlogPostingSource): JsonLdNode {
  const url = toAbsoluteUrl(siteUrl, post.path);
  const images = toImageUrls(post.imageSources, url);
  return {
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    headline: post.title,
    description: post.description || undefined,
    image: images.length > 0 ? images : undefined,
    datePublished: post.publishedAt.toISOString(),
    dateModified: post.updatedAt.toISOString(),
    author: { '@type': 'Person', name: post.authorName },
    publisher: toOrganizationSummary(siteUrl),
    keywords: post.tags.length > 0 ? post.tags : undefined,
    inLanguage: 'ja',
  };
}


/**
 * よくある質問のページのノードを生成する。
 *
 * @param siteUrl - サイトの URL
 * @param page - 質問と回答の情報
 * @returns `FAQPage` のノード
 * @see https://developers.google.com/search/docs/appearance/structured-data/faqpage
 */
export function toFaqPage(siteUrl: URL, page: FaqPageSource): JsonLdNode {
  const url = toAbsoluteUrl(siteUrl, page.path);
  return {
    '@type': 'FAQPage',
    '@id': url,
    url,
    inLanguage: 'ja',
    mainEntity: page.faqs.map((faq) => ({
      '@type': 'Question',
      url: `${url}#${faq.fragment}`,
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answerHtml,
      },
    })),
  };
}


/**
 * JSON-LD のノードを、`<script>` 要素に埋め込む文字列に変換する。
 *
 * ノードが複数ある場合は `@graph` にまとめる。
 * 記事のタイトルなどに `</script>` が含まれていても要素が閉じられないよう、`<` をエスケープする。
 *
 * @param nodes - ノード
 * @returns JSON の文字列
 */
export function serializeJsonLd(nodes: JsonLdNode[]): string {
  const jsonLd = nodes.length === 1
    ? { '@context': 'https://schema.org', ...nodes[0] }
    : { '@context': 'https://schema.org', '@graph': nodes };
  return JSON.stringify(jsonLd).replaceAll('<', String.raw`\u003c`);
}
