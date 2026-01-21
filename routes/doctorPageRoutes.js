import express from "express";
import pool from "../db.js";
import { generateDoctorSEO } from "../seo/doctorSeo.js";
import { buildSeoTags } from "../seo/buildSeoTags.js";
import { renderHtml } from "../utils/renderHtml.js";

const router = express.Router();

/**
 * DOCTOR PROFILE PAGE (SEO HTML)
 * URL: /:city/doctor/:slug
 */
router.get("/:city/doctor/:slug", async (req, res) => {
  try {
    const { city, slug } = req.params;

    // 1️⃣ Fetch doctor
    const [rows] = await pool.query(
      `
      SELECT d.*, c.name AS city_name
      FROM doctors d
      LEFT JOIN cities c ON c.id = d.city_id
      WHERE LOWER(d.slug) = LOWER(?)
      LIMIT 1
      `,
      [slug]
    );

    if (!rows.length) {
      return res.status(404).send("Doctor not found");
    }

    const doctor = rows[0];

    // 2️⃣ Generate SEO
    const seo = generateDoctorSEO(doctor);

    // 3️⃣ Build SEO tags
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const seoTags = buildSeoTags(seo, fullUrl);

    // 4️⃣ Render HTML
    const html = renderHtml(seoTags);

    // 5️⃣ Send HTML
    res.setHeader("Content-Type", "text/html");
    return res.send(html);

  } catch (err) {
    console.error("❌ Doctor page SEO error:", err);
    return res.status(500).send("Server error");
  }
});

export default router;
