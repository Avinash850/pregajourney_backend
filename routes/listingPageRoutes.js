import express from "express";
// import { generateListingSEO } from "../seo/listingSeo.js";
// import { buildSeoTags } from "../seo/buildSeoTags.js";
// import { renderHtml } from "../utils/renderHtml.js";

const router = express.Router();

/**
 * LISTING / INTENT PAGE (SEO HTML)
 * Examples:
 * /:city/gynecologist-and-obstetrician
 * /:city/fetal-medicine
 * /:city/clinics
 */
router.get("/:city/:intentSlug", async (req, res) => {
  try {
    const { city, intentSlug } = req.params;

    // Ignore profile routes (safety)
    if (intentSlug.startsWith("dr-")) {
      return res.status(404).send("Not a listing page");
    }

    // 1️⃣ Generate SEO (NO API CALL NEEDED)
    const seo = generateListingSEO({
      city,
      keyword: intentSlug,
    });

    // 2️⃣ Build SEO tags
    const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    const seoTags = buildSeoTags(seo, fullUrl);

    // 3️⃣ Render HTML
    const html = renderHtml(seoTags);

    // 4️⃣ Send HTML
    res.setHeader("Content-Type", "text/html");
    return res.send(html);

  } catch (err) {
    console.error("❌ Listing page SEO error:", err);
    return res.status(500).send("Server error");
  }
});

export default router;
