import pool from "../db.js";

export const suggestLocations = async (req, res) => {
  try {
    let { q } = req.query;
    const hasQuery = q && q.trim().length > 0 && q.toLowerCase() !== "null";

    const search = hasQuery
      ? `%${q.toLowerCase().replace(/[\s.]+/g, "%")}%`
      : null;

    // -------------------------------
    // 1️⃣ CITY (ONLY REAL CITIES)
    // -------------------------------
    const citiesSql = `
      SELECT 
        ci.id AS city_id,
        ci.name AS city_name,
        ci.slug AS city_slug,
        st.name AS state_name,
        co.name AS country_name
      FROM cities ci
      LEFT JOIN states st ON ci.state_id = st.id
      LEFT JOIN countries co ON st.country_id = co.id
      ${hasQuery ? "WHERE LOWER(REPLACE(ci.name,' ','')) LIKE ?" : ""}
      ORDER BY ci.name ASC
      LIMIT 10
    `;

    const [cities] = await pool.query(
      citiesSql,
      hasQuery ? [search] : []
    );

    // -------------------------------
    // 2️⃣ AREAS (LOCALITIES + ZONES)
    // -------------------------------
    const areasSql = `
      SELECT
        ar.id AS area_id,
        ar.name AS area_name,
        ar.slug AS area_slug,
        ar.zone AS zone,
        ci.id AS city_id,
        ci.name AS city_name,
        ci.slug AS city_slug,
        st.name AS state_name,
        co.name AS country_name
      FROM areas ar
      INNER JOIN cities ci ON ar.city_id = ci.id
      LEFT JOIN states st ON ci.state_id = st.id
      LEFT JOIN countries co ON st.country_id = co.id
      ${
        hasQuery
          ? `
            WHERE 
              LOWER(REPLACE(ar.name,' ','')) LIKE ?
              OR LOWER(REPLACE(ar.zone,' ','')) LIKE ?
          `
          : ""
      }
      ORDER BY ar.name ASC
      LIMIT 15
    `;

    const [areas] = await pool.query(
      areasSql,
      hasQuery ? [search, search] : []
    );

    // -------------------------------
    // 3️⃣ FORMAT RESPONSE
    // -------------------------------
    const formattedCities = cities.map(c => ({
      id: c.city_id,
      name: c.city_name,
      slug: c.city_slug,

      location_level: "city",
      canonical_usage: "url",

      city_id: c.city_id,
      area_id: null,

      display_label: `${c.city_name}${c.state_name ? ", " + c.state_name : ""}`,
      state: c.state_name || "",
      country: c.country_name || ""
    }));

    const formattedAreas = areas.map(a => ({
      id: a.area_id,
      name: a.area_name,
      slug: a.area_slug,
      zone: a.zone,

      location_level: "area",
      canonical_usage: "filter",

      city_id: a.city_id,
      area_id: a.area_id,

      display_label: a.zone
        ? `${a.area_name}, ${a.zone}`
        : `${a.area_name}, ${a.city_name}`,

      city: a.city_name,
      state: a.state_name || "",
      country: a.country_name || ""
    }));

    // -------------------------------
    // 4️⃣ FINAL RESPONSE
    // -------------------------------
    return res.json({
      results: {
        cities: formattedCities,
        areas: formattedAreas
      }
    });

  } catch (error) {
    console.error("❌ Location suggestion error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};
