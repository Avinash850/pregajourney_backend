// export const generateHospitalSEO = (hospital) => {
//   if (!hospital) return null;

//   const name = hospital.name;
//   const city = hospital.city_name || "India";
//   const area = hospital.area_name || "";
//   const designation = hospital.designation || "Hospital";

//   const title =
//     hospital.seo_title ||
//     `${name} - Best ${designation} in ${city}`;

//   const description =
//     hospital.seo_description ||
//     `${name} is a leading ${designation} located in ${area ? area + ", " : ""}${city}. `
//     + `Check doctors, services, procedures, timings, address, contact number, and patient reviews.`;

//   return {
//     title,
//     description,
//     ogImage: hospital.image_url || "",
//   };
// };
