const humanize = (slug = "") =>
  slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());

export const generateListingSEO = ({ city, keyword }) => {
  const specialization = humanize(keyword);
  const cityName = humanize(city);

  const title = `Best ${specialization} Doctors in ${cityName} | Prega Journey`;

  const description =
    `Find the best ${specialization} doctors in ${cityName}. ` +
    `Check experience, ratings, consultation fees, and book appointments online.`;

  return {
    title,
    description,
  };
};
