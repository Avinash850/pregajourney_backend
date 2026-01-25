export const generateDoctorSEO = (doctor) => {
  const name = doctor.name || "";
  const designation =
    doctor.specialization_name ||
    doctor.designation ||
    "Doctor";
  const city = doctor.city_name || "";

  const title =
    doctor.seo_title && doctor.seo_title.trim()
      ? doctor.seo_title
      : `Dr. ${name} – Best ${designation} in ${city} | Prega Journey`;

  const description =
    doctor.seo_description && doctor.seo_description.trim()
      ? doctor.seo_description
      : `Dr. ${name} is a trusted ${designation} in ${city}. Visit to know more about Dr. ${name} expertise and services.`;

  return {
    title,
    description,
    ogImage: doctor.image_url || "",
    schema: doctor.json_schema || "",
  };
};
