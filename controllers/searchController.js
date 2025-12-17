import pool from "../db.js";


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



export const getSearchDetails = async (req, res) => {
  console.log("Incoming params =>", req.query);

  const TABS = [
    { title: "Info", key: "info" },
    // { title: "Stories(23)", key: "stories" },
    // { title: "Consult Q&A", key: "consult" },
    // { title: "Healthfeed", key: "healthfeed" }
  ];

  const sendResponse = (type, items = [], related = {}, forceSingle = null) => {
    const count = Array.isArray(items) ? items.length : 0;
    return res.json({
      type,
      items,
      related,
      meta: {
        single: forceSingle !== null ? forceSingle : count === 1,
        count
      }
    });
  };

  try {
    let { id, type, location, limit, all } = req.query;

    if (!type) return res.status(400).json({ error: "type is required" });
    type = type.toLowerCase();

    id = id && id.toString().trim() ? id.toString().trim() : null;

    const DEFAULT_LIMIT = 1000;
    limit = all === "true" ? null : parseInt(limit, 10) || DEFAULT_LIMIT;

    const tableMap = {
      doctor: "doctors",
      hospital: "hospitals",
      clinic: "clinics",
      specialization: "specializations",
      service: "services",
      procedure: "procedures",
      symptom: "symptoms",
    };

    const tableName = tableMap[type];
    if (!tableName) return res.status(400).json({ error: "Invalid type" });

    const locationJoin = (alias) => `
      LEFT JOIN areas a ON a.id = ${alias}.area_id
      LEFT JOIN cities c ON c.id = ${alias}.city_id
      LEFT JOIN states s ON s.id = c.state_id
    `;

    const specializationJoin = (entity, alias) => `
      LEFT JOIN ${entity}_specialization ms
        ON ms.id = (
          SELECT id FROM ${entity}_specialization
          WHERE ${entity}_id = ${alias}.id
          ORDER BY id DESC
          LIMIT 1
        )
      LEFT JOIN specializations sp ON sp.id = ms.specialization_id
    `;

    /* =====================================================
       MAIN TYPE + ID (doctor / hospital / clinic)
       ===================================================== */
    if (id && ["doctor", "hospital", "clinic"].includes(type)) {
      const alias = "t";

      const [rows] = await pool.query(`
        SELECT ${alias}.*,
               a.name AS area_name,
               c.name AS city_name,
               s.name AS state_name,
               sp.id AS specialization_id,
               sp.name AS specialization_name
        FROM ${tableName} ${alias}
        ${locationJoin(alias)}
        ${specializationJoin(type, alias)}
        WHERE ${alias}.id = ?
        LIMIT 1
      `, [id]);

      if (!rows.length) {
        return sendResponse(type, [], {}, true);
      }

      // ✅ Tabs
      rows[0].tabs = TABS;

      /* =====================================================
         🔥 RELATED DATA (INFO TAB LOGIC)
         ===================================================== */

      // 👉 DOCTOR PROFILE → clinics + hospitals
      if (type === "doctor") {
        const doctorId = rows[0].id;

        const [clinics] = await pool.query(`
          SELECT cl.*,
                 dc.consultation_fee,
                 dc.timings,
                 dc.is_primary
          FROM doctor_clinic dc
          JOIN clinics cl ON cl.id = dc.clinic_id
          WHERE dc.doctor_id = ?
          ORDER BY dc.is_primary DESC
        `, [doctorId]);

        const [hospitals] = await pool.query(`
          SELECT h.*,
                 dh.consultation_fee,
                 dh.timings,
                 dh.is_primary
          FROM doctor_hospital dh
          JOIN hospitals h ON h.id = dh.hospital_id
          WHERE dh.doctor_id = ?
          ORDER BY dh.is_primary DESC
        `, [doctorId]);

        rows[0].clinics = clinics;
        rows[0].hospitals = hospitals;
      }

      // 👉 HOSPITAL PROFILE → doctors
      if (type === "hospital") {
        const hospitalId = rows[0].id;

        const [doctors] = await pool.query(`
          SELECT d.*,
                 dh.consultation_fee,
                 dh.timings,
                 dh.is_primary
          FROM doctor_hospital dh
          JOIN doctors d ON d.id = dh.doctor_id
          WHERE dh.hospital_id = ?
          ORDER BY dh.is_primary DESC
        `, [hospitalId]);

        rows[0].doctors = doctors;
      }

      // 👉 CLINIC PROFILE → doctors
      if (type === "clinic") {
        const clinicId = rows[0].id;

        const [doctors] = await pool.query(`
          SELECT d.*,
                 dc.consultation_fee,
                 dc.timings,
                 dc.is_primary
          FROM doctor_clinic dc
          JOIN doctors d ON d.id = dc.doctor_id
          WHERE dc.clinic_id = ?
          ORDER BY dc.is_primary DESC
        `, [clinicId]);

        rows[0].doctors = doctors;
      }

      return sendResponse(type, rows, {}, true);
    }

    /* =====================================================
       LOCATION RESOLUTION
       ===================================================== */
    const userProvidedLocation = typeof req.query.location !== "undefined";
    location = userProvidedLocation
      ? (location ? location.toString().trim() : "")
      : "Delhi";

    const resolveLocation = async (loc) => {
      const result = { area_id: null, city_id: null, state_city_ids: [] };
      if (!loc) return result;

      if (/^\d+$/.test(loc)) {
        result.area_id = parseInt(loc, 10);
        return result;
      }

      let [rows] = await pool.query(
        `SELECT id FROM areas WHERE LOWER(name)=LOWER(?) LIMIT 1`,
        [loc]
      );
      if (rows.length) return { ...result, area_id: rows[0].id };

      [rows] = await pool.query(
        `SELECT id FROM cities WHERE LOWER(name)=LOWER(?) LIMIT 1`,
        [loc]
      );
      if (rows.length) return { ...result, city_id: rows[0].id };

      [rows] = await pool.query(
        `SELECT id FROM states WHERE LOWER(name)=LOWER(?) LIMIT 1`,
        [loc]
      );
      if (rows.length) {
        const [cityRows] = await pool.query(
          `SELECT id FROM cities WHERE state_id=?`,
          [rows[0].id]
        );
        result.state_city_ids = cityRows.map(r => r.id);
      }

      return result;
    };

    const locationData = await resolveLocation(location);

    const buildMainLocationClause = (alias) => {
      if (locationData.area_id)
        return { clause: `${alias}.area_id = ?`, params: [locationData.area_id] };
      if (locationData.city_id)
        return { clause: `${alias}.city_id = ?`, params: [locationData.city_id] };
      if (locationData.state_city_ids.length) {
        return {
          clause: `${alias}.city_id IN (?)`,
          params: [locationData.state_city_ids]
        };
      }
      return { clause: "", params: [] };
    };

    /* =====================================================
       SUPPORT TYPES
       ===================================================== */
    if (["specialization", "service", "procedure", "symptom"].includes(type)) {
      const mappingTables = {
        specialization: {
          doctor: "doctor_specialization",
          hospital: "hospital_specialization",
          clinic: "clinic_specialization",
          col: "specialization_id",
        }
      };

      const mapping = mappingTables[type];
      const results = {};
      const aliases = { doctor: "d", hospital: "h", clinic: "cl" };

      for (const entity of ["doctor", "hospital", "clinic"]) {
        const alias = aliases[entity];
        let query = `
          SELECT ${alias}.*,
                 a.name AS area_name,
                 c.name AS city_name,
                 s.name AS state_name,
                 sp.id AS specialization_id,
                 sp.name AS specialization_name
          FROM ${tableMap[entity]} ${alias}
          JOIN ${mapping[entity]} m ON m.${entity}_id = ${alias}.id
          ${locationJoin(alias)}
          ${specializationJoin(entity, alias)}
          WHERE 1=1
        `;
        const params = [];

        if (id) {
          query += ` AND m.${mapping.col} = ?`;
          params.push(id);
        }

        const loc = buildMainLocationClause(alias);
        if (loc.clause) {
          query += ` AND ${loc.clause}`;
          params.push(...loc.params);
        }

        query += ` ORDER BY ${alias}.name ASC`;
        if (limit) query += ` LIMIT ${limit}`;

        const [rows] = await pool.query(query, params);
        results[entity] = rows;
      }

      const count =
        results.doctor.length +
        results.hospital.length +
        results.clinic.length;

      return res.json({
        type,
        items: [],
        related: results,
        meta: { single: false, count }
      });
    }

    /* =====================================================
       MAIN TYPE LIST
       ===================================================== */
    const alias = "t";
    const loc = buildMainLocationClause(alias);
    const params = [];

    let q = `
      SELECT ${alias}.*,
             a.name AS area_name,
             c.name AS city_name,
             s.name AS state_name,
             sp.id AS specialization_id,
             sp.name AS specialization_name
      FROM ${tableName} ${alias}
      ${locationJoin(alias)}
      ${specializationJoin(type, alias)}
    `;

    if (loc.clause) {
      q += ` WHERE ${loc.clause}`;
      params.push(...loc.params);
    }

    q += ` ORDER BY ${alias}.name ASC`;
    if (limit) q += ` LIMIT ${limit}`;

    const [rows] = await pool.query(q, params);
    return sendResponse(type, rows);

  } catch (error) {
    console.error("❌ getSearchDetails error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
