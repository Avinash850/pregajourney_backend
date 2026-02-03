// export const generateClinicSEO = (clinic) => {
//   if (!clinic) return null;

//   const name = clinic.name;
//   const city = clinic.city_name || "India";
//   const area = clinic.area_name || "";
//   const designation = "Clinic";

//   const title =
//     clinic.seo_title ||
//     `${name} - Best ${designation} in ${city}`;

//   const description =
//     clinic.seo_description ||
//     `${name} is a trusted ${designation} located in ${
//       area ? area + ", " : ""
//     }${city}. `
//     + `Find doctors, services, timings, address, consultation fees, and patient reviews.`;

//   return {
//     title,
//     description,
//     ogImage: clinic.image_url || "",
//   };
// };
