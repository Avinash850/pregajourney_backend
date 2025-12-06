import pool from "../db.js";

export const suggestLocations = async (req, res) => {
  try {
    let { q } = req.query;
    const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";

    // Normalize input for flexible search
    const normalizedSearch = !isEmptyQuery ? `%${q.toLowerCase().replace(/[\s.]+/g, "%")}%` : "";

    // Helper for safe queries
    const safeQuery = async (sql, params = []) => {
      try {
        const [rows] = await pool.query(sql, params);
        return rows;
      } catch (err) {
        console.warn("⚠️ Skipped query:", sql.split("FROM")[0].trim(), "-", err.message);
        return [];
      }
    };

    // 1️⃣ Fetch cities and states
    const citiesSql = isEmptyQuery
      ? `
        SELECT ci.id AS city_id, ci.name AS city, st.name AS state, co.name AS country
        FROM cities ci
        LEFT JOIN states st ON ci.state_id = st.id
        LEFT JOIN countries co ON st.country_id = co.id
        ORDER BY ci.name ASC
        LIMIT 10
      `
      : `
        SELECT ci.id AS city_id, ci.name AS city, st.name AS state, co.name AS country
        FROM cities ci
        LEFT JOIN states st ON ci.state_id = st.id
        LEFT JOIN countries co ON st.country_id = co.id
        WHERE LOWER(REPLACE(ci.name, ' ', '')) LIKE ?
           OR LOWER(REPLACE(st.name, ' ', '')) LIKE ?
        ORDER BY ci.name ASC
        LIMIT 10
      `;
    const citiesParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch];
    const cities = await safeQuery(citiesSql, citiesParams);

    // 2️⃣ Fetch areas (linked with cities/states)
    const areasSql = isEmptyQuery
      ? `
        SELECT ar.id AS area_id, ar.name AS area, ci.id AS city_id, ci.name AS city,
               st.name AS state, co.name AS country
        FROM areas ar
        LEFT JOIN cities ci ON ar.city_id = ci.id
        LEFT JOIN states st ON ci.state_id = st.id
        LEFT JOIN countries co ON st.country_id = co.id
        ORDER BY ar.name ASC
        LIMIT 10
      `
      : `
        SELECT ar.id AS area_id, ar.name AS area, ci.id AS city_id, ci.name AS city,
               st.name AS state, co.name AS country
        FROM areas ar
        LEFT JOIN cities ci ON ar.city_id = ci.id
        LEFT JOIN states st ON ci.state_id = st.id
        LEFT JOIN countries co ON st.country_id = co.id
        WHERE LOWER(REPLACE(ar.name, ' ', '')) LIKE ?
           OR LOWER(REPLACE(ci.name, ' ', '')) LIKE ?
           OR LOWER(REPLACE(st.name, ' ', '')) LIKE ?
        ORDER BY ar.name ASC
        LIMIT 10
      `;
    const areasParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch, normalizedSearch];
    const areas = await safeQuery(areasSql, areasParams);

    // 3️⃣ Format results for frontend
    const formattedCities = cities.map((r) => ({
      id: r.city_id,
      city_id: r.city_id,
      name: r.city,
      label: `${r.city}${r.state ? `, ${r.state}` : ""}`,
      type: "city",
      city: r.city,
      state: r.state || "",
      country: r.country || "",
    }));

    const formattedAreas = areas.map((a) => ({
      id: a.area_id,
      city_id: a.city_id,
      name: a.area,
      label: `${a.area}${a.city ? `, ${a.city}` : ""} (Area)`,
      type: "area",
      city: a.city || "",
      state: a.state || "",
      country: a.country || "",
    }));

    // 4️⃣ Merge and de-duplicate
    const allResults = [
      ...formattedAreas,
      ...formattedCities.filter(
        (city) => !formattedAreas.find((a) => a.city_id === city.city_id)
      ),
    ];

    return res.json({ results: allResults });
  } catch (error) {
    console.error("❌ Location suggestion error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
