import express from "express";
import pool from "../db.js";
import { generateDoctorSEO } from "../seo/doctorSeo.js";
import { buildSeoTags } from "../seo/buildSeoTags.js";
import { renderHtml } from "../utils/renderHtml.js";

const router = express.Router();

// ✅ Bot detection
const isBot = (req) => {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  return (
    ua.includes("googlebot") ||
    ua.includes("bingbot") ||
    ua.includes("facebookexternalhit") ||
    ua.includes("twitterbot") ||
    ua.includes("whatsapp") ||
    ua.includes("linkedinbot")
  );
};

/**
 * DOCTOR PROFILE PAGE
 * URL: /:city/doctor/:slug
 */
router.get("/:city/doctor/:slug", async (req, res) => {
  try {
    const { slug } = req.params;

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

    const seo = generateDoctorSEO(doctor);
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const seoTags = buildSeoTags(seo, fullUrl);

    // 🟢 BOT → send SEO HTML
    if (isBot(req)) {
      const html = renderHtml(seoTags);
      res.setHeader("Content-Type", "text/html");
      return res.send(html);
    }

    // 🟢 USER → redirect to React frontend
    const frontendUrl =
      process.env.NODE_ENV === "production"
        ? `https://pregajourney.com${req.originalUrl}`
        : `http://localhost:5173${req.originalUrl}`;

    return res.redirect(302, frontendUrl);

  } catch (err) {
    console.error("❌ Doctor page error:", err);
    return res.status(500).send("Server error");
  }
});

export default router;
