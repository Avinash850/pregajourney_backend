import pool from "../db.js";

/**
 * 🔍 Main Search API
 * Handles user searches for doctors, hospitals, and clinics by location + query.
 */
export const search = async (req, res) => {
  try {
    const { location, query } = req.query;

    if (!location || !query) {
      return res.status(400).json({ error: "Location and query are required" });
    }

    // 1️⃣ Try matching city first
    const [cityRows] = await pool.query(
      `SELECT id FROM cities WHERE name LIKE ? LIMIT 1`,
      [`%${location}%`]
    );

    let cityId = cityRows.length ? cityRows[0].id : null;

    // 2️⃣ If no city found, try matching area in address fields
    if (!cityId) {
      const [areaRows] = await pool.query(
        `
        SELECT DISTINCT c.id 
        FROM cities c
        JOIN doctors d ON d.city_id = c.id
        WHERE d.address LIKE ?
        UNION
        SELECT DISTINCT c.id
        FROM cities c
        JOIN hospitals h ON h.city_id = c.id
        WHERE h.address LIKE ?
        UNION
        SELECT DISTINCT c.id
        FROM cities c
        JOIN clinics cl ON cl.city_id = c.id
        WHERE cl.address LIKE ?
        LIMIT 1
      `,
        [`%${location}%`, `%${location}%`, `%${location}%`]
      );

      cityId = areaRows.length ? areaRows[0].id : null;
    }

    if (!cityId) {
      return res.json({ results: [] });
    }

    // 3️⃣ Doctor search
    const [doctors] = await pool.query(
      `SELECT 
           d.id, 
          d.name, 
          'doctor' AS type,
          d.profile_image AS image,
          s.name AS specialization,
          c.name AS city,
          d.address
       FROM doctors d
       JOIN cities c ON d.city_id = c.id
       LEFT JOIN specializations s ON d.specialization_id = s.id
       WHERE c.id = ?
         AND (d.name LIKE ? OR s.name LIKE ? OR d.address LIKE ?)
       `,
      [cityId, `%${query}%`, `%${query}%`, `%${location}%`]
    );

    // 4️⃣ Hospital search
    const [hospitals] = await pool.query(
      `SELECT 
          h.id, 
          h.name, 
          'hospital' AS type,
          h.image,
          c.name AS city,
          h.address
       FROM hospitals h
       JOIN cities c ON h.city_id = c.id
       LEFT JOIN hospital_services hs ON h.id = hs.hospital_id
       LEFT JOIN services s ON hs.service_id = s.id
       LEFT JOIN hospital_procedures hp ON h.id = hp.hospital_id
       LEFT JOIN procedures p ON hp.procedure_id = p.id
       WHERE c.id = ?
         AND (h.name LIKE ? OR s.name LIKE ? OR p.name LIKE ? OR h.address LIKE ?)`,
      [cityId, `%${query}%`, `%${query}%`, `%${query}%`, `%${location}%`]
    );

    // 5️⃣ Clinic search
    const [clinics] = await pool.query(
      `SELECT 
          cl.id, 
          cl.name, 
          'clinic' AS type,
          cl.image,
          c.name AS city,
          cl.address
       FROM clinics cl
       JOIN cities c ON cl.city_id = c.id
       WHERE c.id = ?
         AND (cl.name LIKE ? OR cl.address LIKE ?)`,
      [cityId, `%${query}%`, `%${location}%`]
    );

    // 6️⃣ Merge + Sort
    const results = [...doctors, ...hospitals, ...clinics].sort((a, b) =>
      a.type.localeCompare(b.type)
    );

    return res.json({ results });
  } catch (error) {
    console.error("❌ Search error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * 💡 Suggestion API
 * Used for autocomplete dropdown while typing in the search bar.
 */

// export const suggest = async (req, res) => {
//   try {
//     let { q, location } = req.query;

//     // Normalize inputs
//     const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";
//     const isEmptyLocation = !location || location.trim().length === 0 || location.toLowerCase() === "null";

//     // Normalize search text: "Dr. a" → "%dr%a%"
//     let normalizedSearch = "";
//     if (!isEmptyQuery) {
//       normalizedSearch = `%${q.toLowerCase().replace(/[\s.]+/g, "%")}%`;
//     }

//     // Convert comma-separated location IDs to array
//     const locationIds = !isEmptyLocation ? location.split(",").map(id => id.trim()) : [];

//     // Helper function for safe queries (avoid breaking one query affecting all)
//     const safeQuery = async (query, params = []) => {
//       try {
//         const [rows] = await pool.query(query, params);
//         return rows;
//       } catch (err) {
//         console.warn("⚠️ Skipped query:", query.split("FROM")[0].trim(), "-", err.message);
//         return [];
//       }
//     };

//     // Build WHERE clause for each table
//     const buildQuery = (table, type, hasArea = false) => {
//       const whereClauses = [];
//       const params = [];

//       // Apply search by name if query exists
//       if (!isEmptyQuery) {
//         whereClauses.push(`LOWER(name) LIKE ?`);
//         params.push(normalizedSearch);
//       }

//       // Apply area_id filter only if applicable
//       if (!isEmptyLocation && hasArea && locationIds.length > 0) {
//         whereClauses.push(`area_id IN (${locationIds.map(() => "?").join(",")})`);
//         params.push(...locationIds);
//       }

//       // Build final WHERE string
//       const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

//       return {
//         sql: `SELECT id, name, '${type}' AS type FROM ${table} ${where} LIMIT 5`,
//         params,
//       };
//     };

//     // Define all table configurations
//     const tableConfigs = [
//       { table: "doctors", type: "doctor", hasArea: true },
//       { table: "hospitals", type: "hospital", hasArea: true },
//       { table: "clinics", type: "clinic", hasArea: true },
//       { table: "specializations", type: "specialization", hasArea: false },
//       { table: "services", type: "service", hasArea: false },
//       { table: "procedures", type: "procedure", hasArea: false },
//       { table: "symptoms", type: "symptom", hasArea: false },
//     ];

//     // If no query and no location — return all tables (as your current code)
//     if (isEmptyQuery && isEmptyLocation) {
//       const queries = tableConfigs.map(cfg =>
//         safeQuery(`SELECT id, name, '${cfg.type}' AS type FROM ${cfg.table} LIMIT 5`)
//       );

//       // area query (no filter)
//       const areaQuery = `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors
//           UNION ALL SELECT address FROM hospitals
//           UNION ALL SELECT address FROM clinics
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `;
//       const areaPromise = safeQuery(areaQuery);

//       const [
//         doctors,
//         hospitals,
//         clinics,
//         specializations,
//         services,
//         procedures,
//         symptoms,
//         areas,
//       ] = await Promise.all([...queries, areaPromise]);

//       return res.json({
//         doctors,
//         hospitals,
//         clinics,
//         specializations,
//         services,
//         procedures,
//         symptoms,
//         areas,
//       });
//     }

//     // Otherwise — apply filtering logic (query, location, or both)
//     const queries = tableConfigs.map(cfg => {
//       const { sql, params } = buildQuery(cfg.table, cfg.type, cfg.hasArea);
//       return safeQuery(sql, params);
//     });

//     // Area query (filter if query exists)
//     const areaQuery = isEmptyQuery
//       ? `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors
//           UNION ALL SELECT address FROM hospitals
//           UNION ALL SELECT address FROM clinics
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `
//       : `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors WHERE address LIKE ?
//           UNION ALL SELECT address FROM hospitals WHERE address LIKE ?
//           UNION ALL SELECT address FROM clinics WHERE address LIKE ?
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `;
//     const areaParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch, normalizedSearch];
//     const areaPromise = safeQuery(areaQuery, areaParams);

//     // Run all in parallel
//     const [
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     ] = await Promise.all([...queries, areaPromise]);

//     // Return final structured response
//     res.json({
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     });
//   } catch (error) {
//     console.error("❌ Suggestion error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };






























// export const suggest = async (req, res) => {
//   try {
//     let { q, location } = req.query;

//     // Normalize inputs
//     const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";
//     const isEmptyLocation = !location || location.trim().length === 0 || location.toLowerCase() === "null";

//     // Normalize search text: "Dr. a" → "%dr%a%"
//     let normalizedSearch = "";
//     if (!isEmptyQuery) {
//       normalizedSearch = `%${q.toLowerCase().replace(/[\s.]+/g, "%")}%`;
//     }

//     // Convert comma-separated location IDs to array
//     let locationIds = [];
//     if (!isEmptyLocation) {
//       // Check if frontend sent actual IDs (numeric)
//       const parts = location.split(",").map(l => l.trim());
//       const ids = parts.filter(p => /^\d+$/.test(p));
//       const texts = parts.filter(p => !/^\d+$/.test(p));

//       // Add numeric IDs directly
//       if (ids.length) locationIds.push(...ids);

//       // If any text (city/state names) → fetch corresponding area_ids
//       for (const text of texts) {
//         const likeText = `%${text.toLowerCase().replace(/[\s.]+/g, "%")}%`;

//         // Areas by city
//         const areasByCity = await pool.query(
//           `SELECT a.id FROM areas a
//            JOIN cities c ON a.city_id = c.id
//            WHERE LOWER(REPLACE(c.name, ' ', '')) LIKE ?`,
//           [likeText]
//         );
//         locationIds.push(...areasByCity[0].map(r => r.id));

//         // Areas by state
//         const areasByState = await pool.query(
//           `SELECT a.id FROM areas a
//            JOIN cities c ON a.city_id = c.id
//            JOIN states s ON c.state_id = s.id
//            WHERE LOWER(REPLACE(s.name, ' ', '')) LIKE ?`,
//           [likeText]
//         );
//         locationIds.push(...areasByState[0].map(r => r.id));
//       }
//     }

//     // Remove duplicates
//     locationIds = [...new Set(locationIds)];

//     // Helper function for safe queries
//     const safeQuery = async (query, params = []) => {
//       try {
//         const [rows] = await pool.query(query, params);
//         return rows;
//       } catch (err) {
//         console.warn("⚠️ Skipped query:", query.split("FROM")[0].trim(), "-", err.message);
//         return [];
//       }
//     };

//     // Build WHERE clause for each table
//     const buildQuery = (table, type, hasArea = false) => {
//       const whereClauses = [];
//       const params = [];

//       if (!isEmptyQuery) {
//         whereClauses.push(`LOWER(name) LIKE ?`);
//         params.push(normalizedSearch);
//       }

//       if (hasArea && locationIds.length > 0) {
//         whereClauses.push(`area_id IN (${locationIds.map(() => "?").join(",")})`);
//         params.push(...locationIds);
//       }

//       const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";
//       return { sql: `SELECT id, name, '${type}' AS type FROM ${table} ${where} LIMIT 5`, params };
//     };

//     // Table configs
//     const tableConfigs = [
//       { table: "doctors", type: "doctor", hasArea: true },
//       { table: "hospitals", type: "hospital", hasArea: true },
//       { table: "clinics", type: "clinic", hasArea: true },
//       { table: "specializations", type: "specialization", hasArea: false },
//       { table: "services", type: "service", hasArea: false },
//       { table: "procedures", type: "procedure", hasArea: false },
//       { table: "symptoms", type: "symptom", hasArea: false },
//     ];

//     // Queries for tables
//     const queries = tableConfigs.map(cfg => {
//       const { sql, params } = buildQuery(cfg.table, cfg.type, cfg.hasArea);
//       return safeQuery(sql, params);
//     });

//     // Area query (same as before)
//     const areaQuery = isEmptyQuery
//       ? `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors
//           UNION ALL SELECT address FROM hospitals
//           UNION ALL SELECT address FROM clinics
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `
//       : `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors WHERE address LIKE ?
//           UNION ALL SELECT address FROM hospitals WHERE address LIKE ?
//           UNION ALL SELECT address FROM clinics WHERE address LIKE ?
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `;
//     const areaParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch, normalizedSearch];
//     const areaPromise = safeQuery(areaQuery, areaParams);

//     // Run all queries in parallel
//     const [
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     ] = await Promise.all([...queries, areaPromise]);

//     res.json({
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     });

//   } catch (error) {
//     console.error("❌ Suggestion error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };
















export const suggest = async (req, res) => {
  try {
    let { q, location } = req.query;

    // Normalize inputs
    const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";
    const isEmptyLocation = !location || location.trim().length === 0 || location.toLowerCase() === "null";

    // Normalize search text: "Dr. a" → "%dr%a%"
    let normalizedSearch = "";
    if (!isEmptyQuery) {
      normalizedSearch = `%${q.toLowerCase().replace(/[\s.]+/g, "%")}%`;
    }

    // Convert comma-separated location IDs to array
    let locationIds = [];
    if (!isEmptyLocation) {
      const parts = location.split(",").map(l => l.trim());
      const ids = parts.filter(p => /^\d+$/.test(p));
      const texts = parts.filter(p => !/^\d+$/.test(p));

      if (ids.length) locationIds.push(...ids);

      for (const text of texts) {
        const likeText = `%${text.toLowerCase().replace(/[\s.]+/g, "%")}%`;

        // Areas by city
        const areasByCity = await pool.query(
          `SELECT a.id FROM areas a
           JOIN cities c ON a.city_id = c.id
           WHERE LOWER(REPLACE(c.name, ' ', '')) LIKE ?`,
          [likeText]
        );
        locationIds.push(...areasByCity[0].map(r => r.id));

        // Areas by state
        const areasByState = await pool.query(
          `SELECT a.id FROM areas a
           JOIN cities c ON a.city_id = c.id
           JOIN states s ON c.state_id = s.id
           WHERE LOWER(REPLACE(s.name, ' ', '')) LIKE ?`,
          [likeText]
        );
        locationIds.push(...areasByState[0].map(r => r.id));
      }
    }

    // Remove duplicates
    locationIds = [...new Set(locationIds)];

    // Safe query helper
    const safeQuery = async (query, params = []) => {
      try {
        const [rows] = await pool.query(query, params);
        return rows;
      } catch (err) {
        console.warn("⚠️ Skipped query:", query.split("FROM")[0].trim(), "-", err.message);
        return [];
      }
    };

    // Build WHERE clause per table
    const buildQuery = (table, type, hasArea = false) => {
      const whereClauses = [];
      const params = [];

      // --- New Feature: handle "doctor"/"doctors" keyword ---
      if (!isEmptyQuery) {
        const qLower = q.toLowerCase().trim();

        if (type === "doctor" && (qLower === "doctor" || qLower === "doctors")) {
          // ✅ Skip adding name filter → show all doctors
          // (location filter will still apply below if provided)
        } else {
          // Normal LIKE search for all other queries
          whereClauses.push(`LOWER(name) LIKE ?`);
          params.push(normalizedSearch);
        }
      }

      // Apply location filter if available
      if (hasArea && locationIds.length > 0) {
        whereClauses.push(`area_id IN (${locationIds.map(() => "?").join(",")})`);
        params.push(...locationIds);
      }

      // Combine WHERE parts
      const where = whereClauses.length ? `WHERE ${whereClauses.join(" AND ")}` : "";

      // For "doctor"/"doctors" → return more doctors (limit 20)
      const limit =
        type === "doctor" &&
        !isEmptyQuery &&
        (q.toLowerCase().trim() === "doctor" || q.toLowerCase().trim() === "doctors")
          ? 20
          : 5;

      return { sql: `SELECT id, name, '${type}' AS type FROM ${table} ${where} LIMIT ${limit}`, params };
    };

    // Table configurations
    const tableConfigs = [
      { table: "doctors", type: "doctor", hasArea: true },
      { table: "hospitals", type: "hospital", hasArea: true },
      { table: "clinics", type: "clinic", hasArea: true },
      { table: "specializations", type: "specialization", hasArea: false },
      { table: "services", type: "service", hasArea: false },
      { table: "procedures", type: "procedure", hasArea: false },
      { table: "symptoms", type: "symptom", hasArea: false },
    ];

    // Run table queries
    const queries = tableConfigs.map(cfg => {
      const { sql, params } = buildQuery(cfg.table, cfg.type, cfg.hasArea);
      return safeQuery(sql, params);
    });

    // Area query (same as before)
    const areaQuery = isEmptyQuery
      ? `
        SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
        FROM (
          SELECT address FROM doctors
          UNION ALL SELECT address FROM hospitals
          UNION ALL SELECT address FROM clinics
        ) AS combined
        WHERE address IS NOT NULL
        LIMIT 5
      `
      : `
        SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
        FROM (
          SELECT address FROM doctors WHERE address LIKE ?
          UNION ALL SELECT address FROM hospitals WHERE address LIKE ?
          UNION ALL SELECT address FROM clinics WHERE address LIKE ?
        ) AS combined
        WHERE address IS NOT NULL
        LIMIT 5
      `;
    const areaParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch, normalizedSearch];
    const areaPromise = safeQuery(areaQuery, areaParams);

    // Execute all queries in parallel
    const [
      doctors,
      hospitals,
      clinics,
      specializations,
      services,
      procedures,
      symptoms,
      areas,
    ] = await Promise.all([...queries, areaPromise]);

    // Send response
    res.json({
      doctors,
      hospitals,
      clinics,
      specializations,
      services,
      procedures,
      symptoms,
      areas,
    });

  } catch (error) {
    console.error("❌ Suggestion error:", error);
    res.status(500).json({ error: "Server error" });
  }
};




// export const suggest = async (req, res) => {
//   try {
//     const { q } = req.query;

//     // Check if q is null, an empty string, or the string "null"
//     const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";

//     // If no valid query is passed (empty, null or "null"), return all data without filtering
//     const queries = [
//       isEmptyQuery ? pool.query(`SELECT id, name, 'doctor' AS type FROM doctors LIMIT 5`) : pool.query(`SELECT id, name, 'doctor' AS type FROM doctors WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'hospital' AS type FROM hospitals LIMIT 5`) : pool.query(`SELECT id, name, 'hospital' AS type FROM hospitals WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'clinic' AS type FROM clinics LIMIT 5`) : pool.query(`SELECT id, name, 'clinic' AS type FROM clinics WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'specialization' AS type FROM specializations LIMIT 5`) : pool.query(`SELECT id, name, 'specialization' AS type FROM specializations WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'service' AS type FROM services LIMIT 5`) : pool.query(`SELECT id, name, 'service' AS type FROM services WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'procedure' AS type FROM procedures LIMIT 5`) : pool.query(`SELECT id, name, 'procedure' AS type FROM procedures WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery ? pool.query(`SELECT id, name, 'symptom' AS type FROM symptoms LIMIT 5`) : pool.query(`SELECT id, name, 'symptom' AS type FROM symptoms WHERE name LIKE ? LIMIT 5`, [`%${q}%`]),
//       isEmptyQuery
//         ? pool.query(`
//             SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//             FROM (
//               SELECT address FROM doctors
//               UNION ALL
//               SELECT address FROM hospitals
//               UNION ALL
//               SELECT address FROM clinics
//             ) AS combined
//             WHERE address IS NOT NULL
//             LIMIT 5
//           `)
//         : pool.query(
//             `
//             SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//             FROM (
//               SELECT address FROM doctors WHERE address LIKE ?
//               UNION ALL
//               SELECT address FROM hospitals WHERE address LIKE ?
//               UNION ALL
//               SELECT address FROM clinics WHERE address LIKE ?
//             ) AS combined
//             WHERE address IS NOT NULL
//             LIMIT 5
//           `,
//             [`%${q}%`, `%${q}%`, `%${q}%`]
//           ),
//     ];

//     // Execute all queries in parallel
//     const [
//       [doctors],
//       [hospitals],
//       [clinics],
//       [specializations],
//       [services],
//       [procedures],
//       [symptoms],
//       [areas],
//     ] = await Promise.all(queries);

//     return res.json({
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     });
//   } catch (error) {
//     console.error("❌ Suggestion error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };


// export const suggest = async (req, res) => {
//   try {
//     let { q, location } = req.query;

//     const isEmptyQuery = !q || q.trim().length === 0 || q.toLowerCase() === "null";
//     const isEmptyLocation = !location || location.trim().length === 0 || location.toLowerCase() === "null";

//     // Determine if we should use location or not
//     const useQueryOnly = !isEmptyQuery && q.trim().length >= 3;

//     // Normalize query (like "dr.k" → "%dr%k%")
//     let normalizedSearch = "";
//     if (!isEmptyQuery) {
//       normalizedSearch = `%${q.replace(/[\s.]+/g, "%")}%`;
//     }

//     // Convert location string → array of IDs
//     const locationIds = !isEmptyLocation ? location.split(",").map(id => id.trim()) : [];

//     // Helper for safe queries
//     const safeQuery = async (query, params = []) => {
//       try {
//         const [rows] = await pool.query(query, params);
//         return rows;
//       } catch (err) {
//         console.warn("⚠️ Skipped query:", query.split("FROM")[0].trim(), "-", err.message);
//         return [];
//       }
//     };

//     const buildQuery = (table, type) => {
//       const hasArea = ["doctors", "hospitals", "clinics", "services", "procedures", "symptoms"].includes(table);
//       let whereClauses = [];
//       let params = [];

//       // Case 1: Query-only mode (≥ 3 characters)
//       if (useQueryOnly) {
//         whereClauses.push(`LOWER(name) LIKE LOWER(?)`);
//         params.push(normalizedSearch);
//       }
//       // Case 2: Query < 3 characters → location filter
//       else if (!isEmptyLocation && hasArea) {
//         whereClauses.push(`area_id IN (${locationIds.map(() => "?").join(",")})`);
//         params.push(...locationIds);
//       }

//       // Default limit if nothing applied
//       const where = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";
//       return { sql: `SELECT id, name, '${type}' AS type FROM ${table} ${where} LIMIT 5`, params };
//     };

//     const tableConfigs = [
//       { table: "doctors", type: "doctor" },
//       { table: "hospitals", type: "hospital" },
//       { table: "clinics", type: "clinic" },
//       { table: "specializations", type: "specialization" },
//       { table: "services", type: "service" },
//       { table: "procedures", type: "procedure" },
//       { table: "symptoms", type: "symptom" },
//     ];

//     // Build and run all queries
//     const queries = tableConfigs.map(cfg => {
//       const built = buildQuery(cfg.table, cfg.type);
//       return safeQuery(built.sql, built.params);
//     });

//     // Area query (independent)
//     const areaQuery = isEmptyQuery
//       ? `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors
//           UNION ALL SELECT address FROM hospitals
//           UNION ALL SELECT address FROM clinics
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `
//       : `
//         SELECT DISTINCT SUBSTRING_INDEX(address, ',', 1) AS name, 'area' AS type
//         FROM (
//           SELECT address FROM doctors WHERE address LIKE ?
//           UNION ALL SELECT address FROM hospitals WHERE address LIKE ?
//           UNION ALL SELECT address FROM clinics WHERE address LIKE ?
//         ) AS combined
//         WHERE address IS NOT NULL
//         LIMIT 5
//       `;

//     const areaParams = isEmptyQuery ? [] : [normalizedSearch, normalizedSearch, normalizedSearch];
//     const areaPromise = safeQuery(areaQuery, areaParams);

//     const [
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     ] = await Promise.all([...queries, areaPromise]);

//     res.json({
//       doctors,
//       hospitals,
//       clinics,
//       specializations,
//       services,
//       procedures,
//       symptoms,
//       areas,
//     });
//   } catch (error) {
//     console.error("❌ Suggestion error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };

/**
 * 🔎 Detailed Search Data API
 * Fetch full record by type and id (doctor, hospital, clinic, etc.)
 * Includes city_name and specialization_name for doctors.
 */
// export const getSearchDetails = async (req, res) => {
//   console.log("sdjfljsdlfj==>", req.params)
//   try {
//     const { id, type } = req.query;

//     if (!id || !type) {
//       return res.status(400).json({ error: "id and type are required" });
//     }

//     // Allowed table mapping
//     const tableMap = {
//       doctor: "doctors",
//       hospital: "hospitals",
//       clinic: "clinics",
//       specialization: "specializations",
//       service: "services",
//       procedure: "procedures",
//       symptom: "symptoms",
//     };

//     const tableName = tableMap[type.toLowerCase()];

//     if (!tableName) {
//       return res.status(400).json({ error: "Invalid type" });
//     }

//     let rows;

//     // 🩺 If it's a doctor, join with cities & specializations
//     if (type.toLowerCase() === "doctor") {
//       [rows] = await pool.query(
//         `
//         SELECT 
//           d.*, 
//           c.name AS city_name, 
//           s.name AS specialization_name
//         FROM doctors d
//         LEFT JOIN cities c ON d.city_id = c.id
//         LEFT JOIN specializations s ON d.specialization_id = s.id
//         WHERE d.id = ?
//         LIMIT 1
//         `,
//         [id]
//       );
//     } else {
//       // 🏥 For other types, simple fetch
//       [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);
//     }

//     if (rows.length === 0) {
//       return res.status(404).json({ error: "No record found" });
//     }

//     return res.json({
//       type,
//       data: rows[0],
//     });
//   } catch (error) {
//     console.error("❌ getSearchDetails error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };



// export const getSearchDetails = async (req, res) => {
//   console.log("Incoming params =>", req.query);
//   try {
//     const { id, type } = req.query;

//     if (!id || !type) {
//       return res.status(400).json({ error: "id and type are required" });
//     }

//     const tableMap = {
//       doctor: "doctors",
//       hospital: "hospitals",
//       clinic: "clinics",
//       specialization: "specializations",
//       service: "services",
//       procedure: "procedures",
//       symptom: "symptoms",
//     };

//     const tableName = tableMap[type.toLowerCase()];
//     if (!tableName) {
//       return res.status(400).json({ error: "Invalid type" });
//     }

//     let rows;

//     if (type.toLowerCase() === "doctor") {
//       // 🩺 Fetch doctor info with city & specialization
//       [rows] = await pool.query(
//         `
//         SELECT 
//           d.*, 
//           c.name AS city_name, 
//           s.name AS specialization_name
//         FROM doctors d
//         LEFT JOIN cities c ON d.city_id = c.id
//         LEFT JOIN specializations s ON d.specialization_id = s.id
//         WHERE d.id = ?
//         LIMIT 1
//         `,
//         [id]
//       );

//       if (rows.length === 0) {
//         return res.status(404).json({ error: "Doctor not found" });
//       }

//       const doctorData = rows[0];

//       // 🏥 Get hospital IDs linked to the doctor
//       const [doctorHospitals] = await pool.query(
//         `SELECT hospital_id FROM doctor_hospital WHERE doctor_id = ?`,
//         [id]
//       );

//       let hospitals = [];
//       if (doctorHospitals.length > 0) {
//         const hospitalIds = doctorHospitals.map((d) => d.hospital_id);
//         const [hospitalRows] = await pool.query(
//           `SELECT * FROM hospitals WHERE id IN (?)`,
//           [hospitalIds]
//         );
//         hospitals = hospitalRows;
//       }

//       // ✅ Return final data
//       return res.json({
//         type,
//         data: doctorData,
//         tabs: ["Info", "Stories", "ConsultQ&A", "Healthfeed"],
//         hospitals,
//       });

//     } else {
//       // 🏥 For other types, normal fetch
//       [rows] = await pool.query(`SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`, [id]);

//       if (rows.length === 0) {
//         return res.status(404).json({ error: "No record found" });
//       }

//       return res.json({
//         type,
//         data: rows[0],
//       });
//     }
//   } catch (error) {
//     console.error("❌ getSearchDetails error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };


export const getSearchDetails = async (req, res) => {
  console.log("Incoming params =>", req.query);
  try {
    const { id, type, location } = req.query;

    if (!id || !type) {
      return res.status(400).json({ error: "id and type are required" });
    }

    const tableMap = {
      doctor: "doctors",
      hospital: "hospitals",
      clinic: "clinics",
      specialization: "specializations",
      service: "services",
      procedure: "procedures",
      symptom: "symptoms",
    };

    const tableName = tableMap[type.toLowerCase()];
    if (!tableName) {
      return res.status(400).json({ error: "Invalid type" });
    }

    let rows;

    if (type.toLowerCase() === "doctor") {
      // 🩺 Fetch doctor info with city & specialization
      [rows] = await pool.query(
        `
        SELECT 
          d.*, 
          c.name AS city_name, 
          s.name AS specialization_name
        FROM doctors d
        LEFT JOIN cities c ON d.city_id = c.id
        LEFT JOIN specializations s ON d.specialization_id = s.id
        WHERE d.id = ?
        LIMIT 1
        `,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "Doctor not found" });
      }

      const doctorData = rows[0];
      const doctorDetails = {
        ...doctorData,
        id: doctorData?.id || null,
        name: doctorData?.name || null,
        specialty: doctorData?.specialization_name || null,
        location: doctorData?.address || null,
        clinic: doctorData?.clinic || null,
        rating: doctorData?.rating || null,
        fee: doctorData?.consultation_fee || null,
        mode: "ON - CALL",
        address:
          "Shop Number LG-39, Mahagun Mart, Gaur City-2, Opposite 11th Avenue, Greater Noida" ||
          null,
        images: [
          "/img1.jpg",
          "/img2.jpg",
          "/img3.jpg",
          "/img4.jpg",
          "/img5.jpg",
        ],
        tabs: [
          { title: "Info", key: "info" },
          { title: "Stories(23)", key: "stories" },
          { title: "Consult Q&A", key: "consult" },
          { title: "Healthfeed", key: "healthfeed" },
        ],
      };

      const [doctorHospitals] = await pool.query(
        `SELECT hospital_id FROM doctor_hospital WHERE doctor_id = ?`,
        [id]
      );

      let hospitals = [];
      if (doctorHospitals.length > 0) {
        const hospitalIds = doctorHospitals.map((d) => d.hospital_id);
        const [hospitalRows] = await pool.query(
          `SELECT * FROM hospitals WHERE id IN (?)`,
          [hospitalIds]
        );
        hospitals = hospitalRows;
      }

      return res.json({
        type,
        data: doctorDetails,
        hospitals,
      });
    } 
    
    // 🧠 For specialization or other types
    else {
      [rows] = await pool.query(
        `SELECT * FROM ${tableName} WHERE id = ? LIMIT 1`,
        [id]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: "No record found" });
      }

      const data = rows[0];

      let doctors = [];

      // 🩺 If type is specialization — fetch related doctors
      if (type.toLowerCase() === "specialization") {
        [doctors] = await pool.query(
          `
          SELECT 
            d.*, 
            c.name AS city_name, 
            s.name AS specialization_name
          FROM doctors d
          LEFT JOIN cities c ON d.city_id = c.id
          LEFT JOIN specializations s ON d.specialization_id = s.id
          WHERE d.specialization_id = ?
          `,
          [id]
        );
      }

      return res.json({
        type,
        data,
        doctors, // include related doctors if available
      });
    }
  } catch (error) {
    console.error("❌ getSearchDetails error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
