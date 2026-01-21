export const buildSeoTags = (seo, url = "") => {
  if (!seo) return "";

  return `
    <title>${seo.title}</title>
    <meta name="description" content="${seo.description}" />

    <meta property="og:title" content="${seo.title}" />
    <meta property="og:description" content="${seo.description}" />
    ${seo.ogImage ? `<meta property="og:image" content="${seo.ogImage}" />` : ""}
    ${url ? `<meta property="og:url" content="${url}" />` : ""}

    <meta name="twitter:card" content="summary_large_image" />
  `;
};
