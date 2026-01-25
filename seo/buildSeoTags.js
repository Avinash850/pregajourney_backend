const escapeHtml = (str = "") =>
  str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export const buildSeoTags = (seo, url = "") => {
  if (!seo) return "";

  return `
    <title>${escapeHtml(seo.title)}</title>
    <meta name="description" content="${escapeHtml(seo.description)}" />

    <link rel="canonical" href="${url}" />

    <!-- Open Graph -->
    <meta property="og:type" content="profile" />
    <meta property="og:site_name" content="Prega Journey" />
    <meta property="og:title" content="${escapeHtml(seo.title)}" />
    <meta property="og:description" content="${escapeHtml(seo.description)}" />
    ${seo.ogImage ? `<meta property="og:image" content="${seo.ogImage}" />` : ""}
    ${url ? `<meta property="og:url" content="${url}" />` : ""}

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image" />
  `;
};
