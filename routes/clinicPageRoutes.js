import express from "express";
import pool from "../db.js";
// import { generateClinicSEO } from "../seo/clinicSeo.js";
// import { buildSeoTags } from "../seo/buildSeoTags.js";
// import { renderHtml } from "../utils/renderHtml.js";

const router = express.Router();

/**
 * CLINIC PROFILE PAGE (SEO HTML)
 * URL: /:city/clinic/:slug
 */
// router.get("/:city/clinic/:slug", async (req, res) => {
//   try {
//     const { city, slug } = req.params;

//     // 1️⃣ Fetch clinic
//     const [rows] = await pool.query(
//       `
//       SELECT cl.*,
//              a.name AS area_name,
//              c.name AS city_name,
//              s.name AS state_name
//       FROM clinics cl
//       LEFT JOIN areas a ON a.id = cl.area_id
//       LEFT JOIN cities c ON c.id = cl.city_id
//       LEFT JOIN states s ON s.id = c.state_id
//       WHERE LOWER(cl.slug) = LOWER(?)
//       LIMIT 1
//       `,
//       [slug]
//     );

//     if (!rows.length) {
//       return res.status(404).send("Clinic not found");
//     }

//     const clinic = rows[0];

//     // 2️⃣ Generate SEO
//     const seo = generateClinicSEO(clinic);

//     // 3️⃣ Build SEO tags
//     const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
//     const seoTags = buildSeoTags(seo, fullUrl);

//     // 4️⃣ Render HTML
//     const html = renderHtml(seoTags);

//     // 5️⃣ Send HTML
//     res.setHeader("Content-Type", "text/html");
//     return res.send(html);

//   } catch (err) {
//     console.error("❌ Clinic page SEO error:", err);
//     return res.status(500).send("Server error");
//   }
// });

export default router;
