import express from "express";
import pool from "../db.js";
import { generateHospitalSEO } from "../seo/hospitalSeo.js";
import { buildSeoTags } from "../seo/buildSeoTags.js";
import { renderHtml } from "../utils/renderHtml.js";

const router = express.Router();

/**
 * HOSPITAL PROFILE PAGE (SEO HTML)
 * URL: /:city/hospital/:slug
 */
router.get("/:city/hospital/:slug", async (req, res) => {
  try {
    const { city, slug } = req.params;

    // 1️⃣ Fetch hospital
    const [rows] = await pool.query(
      `
      SELECT h.*, 
             a.name AS area_name,
             c.name AS city_name,
             s.name AS state_name
      FROM hospitals h
      LEFT JOIN areas a ON a.id = h.area_id
      LEFT JOIN cities c ON c.id = h.city_id
      LEFT JOIN states s ON s.id = c.state_id
      WHERE LOWER(h.slug) = LOWER(?)
      LIMIT 1
      `,
      [slug]
    );

    if (!rows.length) {
      return res.status(404).send("Hospital not found");
    }

    const hospital = rows[0];

    // 2️⃣ Generate SEO
    const seo = generateHospitalSEO(hospital);

    // 3️⃣ Build SEO tags
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const seoTags = buildSeoTags(seo, fullUrl);

    // 4️⃣ Render HTML
    const html = renderHtml(seoTags);

    // 5️⃣ Send HTML
    res.setHeader("Content-Type", "text/html");
    return res.send(html);

  } catch (err) {
    console.error("❌ Hospital page SEO error:", err);
    return res.status(500).send("Server error");
  }
});

export default router;
