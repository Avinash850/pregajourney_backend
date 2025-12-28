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




const sendResponse = (res, body) => {
  return res.json({
    payload: body,   // 👈 EXACT SAME body as before
    context: {
      source: "search",
      ts: Date.now(),
    },
  });
};




export const suggest = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json([]);
    }

    const keyword = q.toLowerCase().trim();
    const tokens = keyword.split(/\s+/).filter(Boolean);
    if (!tokens.length) return res.json([]);

    const buildWhereClause = (field) =>
      tokens.map(() => `LOWER(${field}) LIKE ?`).join(" AND ");

    const searchValues = tokens.map((t) => `%${t}%`);

    const safe = async (sql, params = []) => {
      try {
        const [rows] = await pool.query(sql, params);
        return rows;
      } catch (err) {
        console.error("❌ SQL error:", err.sqlMessage);
        return [];
      }
    };

    /* ===================== INTENT SUGGESTIONS ===================== */
    const intents = [];

    if ("doctor".startsWith(keyword)) {
      intents.push({
        type: "intent",
        intent: "doctor",
        name: "Doctors",
        slug: "doctors",
      });
    }

    if ("hospital".startsWith(keyword)) {
      intents.push({
        type: "intent",
        intent: "hospital",
        name: "Hospitals",
        slug: "hospitals",
      });
    }

    if ("clinic".startsWith(keyword)) {
      intents.push({
        type: "intent",
        intent: "clinic",
        name: "Clinics",
        slug: "clinics",
      });
    }

    /* ===================== ENTITY SEARCH ===================== */
    const [
      doctors,
      hospitals,
      clinics,
      specializations,
      services,
      symptoms,
    ] = await Promise.all([
      safe(
        `
        SELECT 
          d.name,
          d.slug,
          'doctor' AS type,
          c.name AS city,
          c.slug AS city_slug
        FROM doctors d
        JOIN cities c ON c.id = d.city_id
        WHERE ${buildWhereClause("d.name")}
        LIMIT 5
        `,
        searchValues
      ),

      safe(
        `
        SELECT 
          h.name,
          h.slug,
          'hospital' AS type,
          c.name AS city,
          c.slug AS city_slug
        FROM hospitals h
        JOIN cities c ON c.id = h.city_id
        WHERE ${buildWhereClause("h.name")}
        LIMIT 5
        `,
        searchValues
      ),

      safe(
        `
        SELECT 
          cl.name,
          cl.slug,
          'clinic' AS type,
          c.name AS city,
          c.slug AS city_slug
        FROM clinics cl
        JOIN cities c ON c.id = cl.city_id
        WHERE ${buildWhereClause("cl.name")}
        LIMIT 5
        `,
        searchValues
      ),

      safe(
        `
        SELECT name, slug, 'specialization' AS type
        FROM specializations
        WHERE ${buildWhereClause("name")}
        LIMIT 5
        `,
        searchValues
      ),

      safe(
        `
        SELECT name, slug, 'service' AS type
        FROM services
        WHERE ${buildWhereClause("name")}
        LIMIT 5
        `,
        searchValues
      ),

      safe(
        `
        SELECT name, slug, 'symptom' AS type
        FROM symptoms
        WHERE ${buildWhereClause("name")}
        LIMIT 5
        `,
        searchValues
      ),
    ]);

    const result = [
      ...intents,
      ...specializations,
      ...services,
      ...symptoms,
      ...doctors,
      ...clinics,
      ...hospitals,
    ];

    res.json(result);
  } catch (err) {
    console.error("❌ suggest error:", err);
    res.status(500).json({ error: "Server error" });
  }
};




const encodeCursor = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

const decodeCursor = (cursor) => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString());
  } catch {
    return null;
  }
};




//new api 

const parseTiming = (timing) => {
  if (!timing) return null;

  const parts = timing.split("|").map(p => p.trim());

  return {
    days: parts[0] || null,
    time: parts[1] || null,
  };
};

const getServicesByType = async (type, id) => {
  let joinTable = "";
  let idColumn = "";

  if (type === "doctor") {
    joinTable = "doctor_service";
    idColumn = "doctor_id";
  } else if (type === "clinic") {
    joinTable = "clinic_service";
    idColumn = "clinic_id";
  } else if (type === "hospital") {
    joinTable = "hospital_service";
    idColumn = "hospital_id";
  }

  const [rows] = await pool.query(
    `
    SELECT s.id, s.name, s.slug
    FROM ${joinTable} js
    JOIN services s ON s.id = js.service_id
    WHERE js.${idColumn} = ?
    ORDER BY s.name ASC
    `,
    [id]
  );

  return rows;
};




export const getSearchDetails = async (req, res) => {
  try {
    const { type, slug, city, area, limit = 20, profile = "false" } = req.query;

    if (!type) return res.status(400).json({ error: "type is required" });

    const isProfile = profile === "true";
    const params = [];

    let cityId = null;
    let areaId = null;

    if (city) {
      const [rows] = await pool.query(
        `SELECT id FROM cities WHERE LOWER(slug)=LOWER(?) LIMIT 1`,
        [city]
      );
      cityId = rows?.[0]?.id || null;
    }

    if (area) {
      const [rows] = await pool.query(
        `SELECT id FROM areas WHERE LOWER(name)=LOWER(?) LIMIT 1`,
        [area]
      );
      areaId = rows?.[0]?.id || null;
    }

    /* ================= PROFILE MODE ================= */
    if (isProfile && slug && ["doctor", "hospital", "clinic"].includes(type)) {
      const table = `${type}s`;

      const [idRows] = await pool.query(
        `SELECT id FROM ${table} WHERE LOWER(slug)=LOWER(?) LIMIT 1`,
        [slug]
      );

      if (!idRows.length) {
        return res.json({ type, items: [], meta: { single: true, count: 0 } });
      }

      /* ===== PRIMARY SPECIALIZATION (DOCTOR ONLY – KEEP) ===== */
      let specializationJoin = "";
      let specializationSelect = "";

      if (type === "doctor") {
        specializationJoin = `
          LEFT JOIN doctor_specialization ds 
            ON ds.doctor_id = t.id AND ds.is_primary = 1
          LEFT JOIN specializations sp 
            ON sp.id = ds.specialization_id
        `;
        specializationSelect = ", sp.name AS specialization_name";
      }

      const [profileRows] = await pool.query(
        `
        SELECT t.*, a.name area_name, c.name city_name, s.name state_name
        ${specializationSelect}
        FROM ${table} t
        LEFT JOIN areas a ON a.id = t.area_id
        LEFT JOIN cities c ON c.id = t.city_id
        LEFT JOIN states s ON s.id = c.state_id
        ${specializationJoin}
        WHERE t.id = ?
        LIMIT 1
        `,
        [idRows[0].id]
      );

      const item = profileRows[0];

      /* ===== SERVICES (EXISTING, DO NOT TOUCH) ===== */
      item.services = await getServicesByType(type, item.id);

      /* ===== DOCTOR: ALL SPECIALIZATIONS (ALREADY DONE) ===== */
      if (type === "doctor") {
        const [specRows] = await pool.query(
          `
          SELECT sp.id, sp.name
          FROM doctor_specialization ds
          JOIN specializations sp 
            ON sp.id = ds.specialization_id
          WHERE ds.doctor_id = ?
          ORDER BY ds.is_primary DESC, sp.name ASC
          `,
          [item.id]
        );

        item.specializations = specRows;
      }

      /* ===== HOSPITAL: PROCEDURES (NEW) ===== */
      if (type === "hospital") {
        const [procedureRows] = await pool.query(
          `
          SELECT p.id, p.name
          FROM hospital_procedure hp
          JOIN procedures p 
            ON p.id = hp.procedure_id
          WHERE hp.hospital_id = ?
          ORDER BY p.name ASC
          `,
          [item.id]
        );

        item.procedures = procedureRows;
      }

      /* ===== HOSPITAL: SPECIALIZATIONS / SPECIALISTS (NEW) ===== */
      if (type === "hospital") {
        const [specRows] = await pool.query(
          `
          SELECT sp.id, sp.name
          FROM hospital_specialization hs
          JOIN specializations sp 
            ON sp.id = hs.specialization_id
          WHERE hs.hospital_id = ?
          ORDER BY sp.name ASC
          `,
          [item.id]
        );

        item.specializations = specRows;
      }

      /* ===== DOCTOR PROFILE ===== */
      if (type === "doctor") {
        const [clinicRows] = await pool.query(
          `
          SELECT cl.*, dc.consultation_fee, dc.timings, dc.is_primary,
                 dc.is_on_call, dc.practice_address
          FROM doctor_clinic dc
          JOIN clinics cl ON cl.id = dc.clinic_id
          WHERE dc.doctor_id = ?
          ORDER BY dc.is_primary DESC
          `,
          [item.id]
        );

        item.clinics = clinicRows.map(c => {
          const parsed = parseTiming(c.timings || c.timing);
          return {
            ...c,
            display_timing_days: parsed?.days || null,
            display_timing_time: parsed?.time || null,
            display_address: c.practice_address || c.address,
          };
        });

        const [hospitalRows] = await pool.query(
          `
          SELECT h.*, dh.consultation_fee, dh.timings,
                 dh.is_primary, dh.is_on_call
          FROM doctor_hospital dh
          JOIN hospitals h ON h.id = dh.hospital_id
          WHERE dh.doctor_id = ?
          ORDER BY dh.is_primary DESC
          `,
          [item.id]
        );

        item.hospitals = hospitalRows;
      }

      /* ===== HOSPITAL → DOCTORS (EXISTING) ===== */
      if (type === "hospital") {
        const [doctorRows] = await pool.query(
          `
          SELECT d.*, dh.consultation_fee, dh.timings,
                 dh.is_primary, dh.is_on_call
          FROM doctor_hospital dh
          JOIN doctors d ON d.id = dh.doctor_id
          WHERE dh.hospital_id = ?
          ORDER BY dh.is_primary DESC, d.name ASC
          `,
          [item.id]
        );

        item.doctors = doctorRows;
      }

      /* ===== CLINIC → DOCTORS ===== */
      if (type === "clinic") {
        const [doctorRows] = await pool.query(
          `
          SELECT d.*, dc.consultation_fee, dc.timings,
                 dc.is_primary, dc.is_on_call
          FROM doctor_clinic dc
          JOIN doctors d ON d.id = dc.doctor_id
          WHERE dc.clinic_id = ?
          ORDER BY dc.is_primary DESC, d.name ASC
          `,
          [item.id]
        );

        item.doctors = doctorRows;
      }

      return res.json({
        type,
        items: [item],
        meta: { single: true, count: 1 },
      });
    }

    /* ================= LIST MODE ================= */
    if (["doctor", "hospital", "clinic"].includes(type)) {
      const table = `${type}s`;
      let where = "WHERE 1=1";

      if (cityId) { where += " AND t.city_id=?"; params.push(cityId); }
      if (areaId) { where += " AND t.area_id=?"; params.push(areaId); }

      const [rows] = await pool.query(
        `
        SELECT t.*, a.name area_name, c.name city_name, s.name state_name
        FROM ${table} t
        LEFT JOIN areas a ON a.id = t.area_id
        LEFT JOIN cities c ON c.id = t.city_id
        LEFT JOIN states s ON s.id = c.state_id
        ${where}
        ORDER BY t.name ASC
        LIMIT ?
        `,
        [...params, Number(limit)]
      );

      return res.json({
        type,
        items: rows,
        meta: { single: false, count: rows.length },
      });
    }

    return res.status(400).json({ error: "Invalid type" });
  } catch (err) {
    console.error("❌ getSearchDetails error:", err);
    res.status(500).json({ error: "Server error" });
  }
};




export const searchByIntent = async (req, res) => {
  try {
    const {
      q,
      city,
      area,
      gender,
      experience,
      sort,
      page = 1,
      limit = 20,
    } = req.query;

    if (!q) {
      return res.status(400).json({ error: "q (keyword) is required" });
    }

    const keyword = q.trim().toLowerCase();
    const normalizedName = keyword.replace(/-/g, " ");

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const offset = (pageNum - 1) * limitNum;

    let cityId = null;
    let areaId = null;

    if (city) {
      const [[c]] = await pool.query(
        `SELECT id FROM cities WHERE LOWER(slug)=LOWER(?) OR LOWER(name)=LOWER(?) LIMIT 1`,
        [city, city]
      );
      cityId = c?.id || null;
    }

    if (area) {
      const [[a]] = await pool.query(
        `SELECT id FROM areas WHERE LOWER(slug)=LOWER(?) LIMIT 1`,
        [area]
      );
      areaId = a?.id || null;
    }

    if (keyword === "specializations") {
      const [doctors] = await pool.query(
        `
        SELECT DISTINCT d.id, d.name, d.slug, d.image_url, d.rating
        FROM doctors d
        JOIN doctor_specialization ds ON ds.doctor_id = d.id
        WHERE d.status = 'active'
        ${cityId ? "AND d.city_id = ?" : ""}
        `,
        cityId ? [cityId] : []
      );

      const [hospitals] = await pool.query(
        `
        SELECT DISTINCT h.id, h.name, h.slug, h.image_url, h.rating
        FROM hospitals h
        JOIN doctor_hospital dh ON dh.hospital_id = h.id
        JOIN doctor_specialization ds ON ds.doctor_id = dh.doctor_id
        ${cityId ? "WHERE h.city_id = ?" : ""}
        `,
        cityId ? [cityId] : []
      );

      const [clinics] = await pool.query(
        `
        SELECT DISTINCT cl.id, cl.name, cl.slug, cl.image_url, cl.rating
        FROM clinics cl
        JOIN doctor_clinic dc ON dc.clinic_id = cl.id
        JOIN doctor_specialization ds ON ds.doctor_id = dc.doctor_id
        ${cityId ? "WHERE cl.city_id = ?" : ""}
        `,
        cityId ? [cityId] : []
      );

      return res.json({
        items: [
          ...doctors.map(d => ({ entity_type: "doctor", data: d })),
          ...hospitals.map(h => ({ entity_type: "hospital", data: h })),
          ...clinics.map(c => ({ entity_type: "clinic", data: c })),
        ],
        meta: {
          intent: "specializations",
          keyword,
          total: doctors.length + hospitals.length + clinics.length,
          doctors: doctors.length,
          hospitals: hospitals.length,
          clinics: clinics.length,
          page: pageNum,
          limit: limitNum,
          has_more: false
        }
      });
    }

    let entity_type = null;
    let entity_id = null;

    const [[intent]] = await pool.query(
      `
      SELECT entity_type, entity_id
      FROM search_intents
      WHERE keyword = ?
        AND status = 1
      ORDER BY priority DESC
      LIMIT 1
      `,
      [keyword]
    );

    if (intent) {
      entity_type = intent.entity_type;
      entity_id = intent.entity_id;
    }

    if (!entity_id) {
      const fallbacks = [
        { type: "specialization", table: "specializations" },
        { type: "symptom", table: "symptoms" },
        { type: "service", table: "services" },
        { type: "procedure", table: "procedures" },
      ];

      for (const fb of fallbacks) {
        const [[row]] = await pool.query(
          `
          SELECT id
          FROM ${fb.table}
          WHERE slug = ?
             OR LOWER(name) = ?
          LIMIT 1
          `,
          [keyword, normalizedName]
        );

        if (row) {
          entity_type = fb.type;
          entity_id = row.id;
          break;
        }
      }
    }

    if (entity_type === "doctor") {
      const where = ["d.status = 'active'"];
      const params = [];

      if (cityId) {
        where.push("d.city_id = ?");
        params.push(cityId);
      }

      if (areaId) {
        where.push("d.area_id = ?");
        params.push(areaId);
      }

      if (gender) {
        where.push("d.gender = ?");
        params.push(gender);
      }

      if (experience) {
        where.push("d.experience_years >= ?");
        params.push(Number(experience));
      }

      const whereSQL = `WHERE ${where.join(" AND ")}`;

      let orderBy = "d.rating DESC, d.experience_years DESC";
      if (sort === "experience_desc") {
        orderBy = "d.experience_years DESC";
      }

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM doctors d ${whereSQL}`,
        params
      );

      const total = countRow.total;

      const [doctors] = await pool.query(
        `
        SELECT
          d.id, d.name, d.slug, d.image_url,
          d.is_profile_claimed,
          d.experience_years, d.rating, d.consultation_fee,
          a.name AS area_name,
          c.name AS city_name,
          sp.name AS specialization_name
        FROM doctors d
        LEFT JOIN areas a ON a.id = d.area_id
        LEFT JOIN cities c ON c.id = d.city_id
        LEFT JOIN doctor_specialization ds ON ds.doctor_id = d.id AND ds.is_primary = 1
        LEFT JOIN specializations sp ON sp.id = ds.specialization_id
        ${whereSQL}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
        `,
        [...params, limitNum, offset]
      );

      return res.json({
        items: doctors.map(d => ({ entity_type: "doctor", data: d })),
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          has_more: offset + doctors.length < total,
          intent: "doctor",
          keyword,
        },
      });
    }

    if (entity_type === "hospital") {
      const where = [];
      const params = [];

      if (cityId) {
        where.push("h.city_id = ?");
        params.push(cityId);
      }

      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM hospitals h ${whereSQL}`,
        params
      );

      const total = countRow.total;

      const [hospitals] = await pool.query(
        `
        SELECT
          h.id, h.name, h.slug, h.image_url,
          h.is_profile_claimed, h.rating, h.timing,
          a.name AS area_name,
          c.name AS city_name
        FROM hospitals h
        LEFT JOIN areas a ON a.id = h.area_id
        LEFT JOIN cities c ON c.id = h.city_id
        ${whereSQL}
        LIMIT ? OFFSET ?
        `,
        [...params, limitNum, offset]
      );

      for (const h of hospitals) {
        const [docs] = await pool.query(
          `
          SELECT
            d.id, d.name, d.slug, d.image_url,
            d.is_profile_claimed, d.rating,
            sp.name AS specialization_name
          FROM doctors d
          JOIN doctor_hospital dh ON dh.doctor_id = d.id
          LEFT JOIN doctor_specialization ds ON ds.doctor_id = d.id AND ds.is_primary = 1
          LEFT JOIN specializations sp ON sp.id = ds.specialization_id
          WHERE dh.hospital_id = ?
            AND d.status = 'active'
          ORDER BY d.rating DESC
          LIMIT 3
          `,
          [h.id]
        );

        h.preview_doctors = docs;
      }

      return res.json({
        items: hospitals.map(h => ({ entity_type: "hospital", data: h })),
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          has_more: offset + hospitals.length < total,
          intent: "hospital",
          keyword,
        },
      });
    }

    if (entity_type === "clinic") {
      const where = [];
      const params = [];

      if (cityId) {
        where.push("cl.city_id = ?");
        params.push(cityId);
      }

      const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [[countRow]] = await pool.query(
        `SELECT COUNT(*) AS total FROM clinics cl ${whereSQL}`,
        params
      );

      const total = countRow.total;

      const [clinics] = await pool.query(
        `
        SELECT
          cl.id, cl.name, cl.slug, cl.image_url,
          cl.is_profile_claimed, cl.rating, cl.timing,
          a.name AS area_name,
          c.name AS city_name
        FROM clinics cl
        LEFT JOIN areas a ON a.id = cl.area_id
        LEFT JOIN cities c ON c.id = cl.city_id
        ${whereSQL}
        LIMIT ? OFFSET ?
        `,
        [...params, limitNum, offset]
      );

      for (const cl of clinics) {
        const [docs] = await pool.query(
          `
          SELECT
            d.id, d.name, d.slug, d.image_url,
            d.is_profile_claimed, d.rating,
            sp.name AS specialization_name
          FROM doctors d
          JOIN doctor_clinic dc ON dc.doctor_id = d.id
          LEFT JOIN doctor_specialization ds ON ds.doctor_id = d.id AND ds.is_primary = 1
          LEFT JOIN specializations sp ON sp.id = ds.specialization_id
          WHERE dc.clinic_id = ?
            AND d.status = 'active'
          ORDER BY d.rating DESC
          LIMIT 3
          `,
          [cl.id]
        );

        cl.preview_doctors = docs;
      }

      return res.json({
        items: clinics.map(c => ({ entity_type: "clinic", data: c })),
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          has_more: offset + clinics.length < total,
          intent: "clinic",
          keyword,
        },
      });
    }

    const map = {
      specialization: "doctor_specialization",
      service: "doctor_service",
      procedure: "doctor_procedure",
      symptom: "doctor_symptom",
    };

    if (map[entity_type] && entity_id) {
      const where = ["d.status = 'active'", `m.${entity_type}_id = ?`];
      const params = [entity_id];

      if (cityId) {
        where.push("d.city_id = ?");
        params.push(cityId);
      }

      const whereSQL = `WHERE ${where.join(" AND ")}`;

      const [[countRow]] = await pool.query(
        `
        SELECT COUNT(DISTINCT d.id) AS total
        FROM doctors d
        JOIN ${map[entity_type]} m ON m.doctor_id = d.id
        ${whereSQL}
        `,
        params
      );

      const total = countRow.total;

      const [doctors] = await pool.query(
        `
        SELECT DISTINCT
          d.id, d.name, d.slug, d.image_url,
          d.is_profile_claimed,
          d.experience_years, d.rating, d.consultation_fee,
          a.name AS area_name,
          c.name AS city_name,
          sp.name AS specialization_name
        FROM doctors d
        JOIN ${map[entity_type]} m ON m.doctor_id = d.id
        LEFT JOIN doctor_specialization ds ON ds.doctor_id = d.id AND ds.is_primary = 1
        LEFT JOIN specializations sp ON sp.id = ds.specialization_id
        LEFT JOIN areas a ON a.id = d.area_id
        LEFT JOIN cities c ON c.id = d.city_id
        ${whereSQL}
        ORDER BY d.rating DESC, d.experience_years DESC
        LIMIT ? OFFSET ?
        `,
        [...params, limitNum, offset]
      );

      return res.json({
        items: doctors.map(d => ({ entity_type: "doctor", data: d })),
        meta: {
          total,
          page: pageNum,
          limit: limitNum,
          has_more: offset + doctors.length < total,
          intent: entity_type,
          keyword,
        },
      });
    }

    return res.json({
      items: [],
      meta: { total: 0, intent: null, keyword },
    });

  } catch (err) {
    console.error("❌ searchByIntent error:", err);
    res.status(500).json({ error: "Server error" });
  }
};







export const searchDiscover = async (req, res) => {
  try {
    const { city, limit = 25 } = req.query;

    if (!city) {
      return res.status(400).json({ error: "city is required" });
    }

    /* ===============================
       1️⃣ Resolve city
    =============================== */
    const [[cityRow]] = await pool.query(
      `
      SELECT id
      FROM cities
      WHERE LOWER(slug)=LOWER(?) OR LOWER(name)=LOWER(?)
      LIMIT 1
      `,
      [city, city]
    );

    if (!cityRow) {
      return res.json({
        top_doctors: [],
        top_hospitals: [],
        top_clinics: [],
        top_services: [],
        top_procedures: [],
      });
    }

    const cityId = cityRow.id;

    /* ===============================
       2️⃣ Top Doctors (Doctor Profile)
    =============================== */
    const [topDoctors] = await pool.query(
      `
      SELECT
        d.id,
        d.name,
        d.slug,
        d.rating
      FROM doctors d
      WHERE d.city_id = ?
        AND d.status = 'active'
      ORDER BY
        d.rating DESC,
        d.patients_count DESC,
        d.experience_years DESC
      LIMIT ?
      `,
      [cityId, Number(limit)]
    );

    /* ===============================
       3️⃣ Top Hospitals
    =============================== */
    const [topHospitals] = await pool.query(
      `
      SELECT
        h.id,
        h.name,
        h.slug,
        h.rating
      FROM hospitals h
      WHERE h.city_id = ?
        AND h.status = 'active'
      ORDER BY
        h.rating DESC,
        h.patients_count DESC
      LIMIT ?
      `,
      [cityId, Number(limit)]
    );

    /* ===============================
       4️⃣ Top Clinics
    =============================== */
    const [topClinics] = await pool.query(
      `
      SELECT
        cl.id,
        cl.name,
        cl.slug,
        cl.rating
      FROM clinics cl
      WHERE cl.city_id = ?
        AND cl.status = 'active'
      ORDER BY cl.rating DESC
      LIMIT ?
      `,
      [cityId, Number(limit)]
    );

    /* ===============================
       5️⃣ Top Services (Doctors + Clinics)
    =============================== */
    const [topServices] = await pool.query(
      `
      SELECT
        s.id,
        s.name,
        s.slug,
        COUNT(DISTINCT ds.doctor_id) AS popularity
      FROM services s
      JOIN doctor_service ds ON ds.service_id = s.id
      JOIN doctors d ON d.id = ds.doctor_id
      WHERE d.city_id = ?
      GROUP BY s.id
      ORDER BY popularity DESC
      LIMIT ?
      `,
      [cityId, Number(limit)]
    );

    /* ===============================
       6️⃣ Top Procedures (Doctors + Hospitals)
    =============================== */
    const [topProcedures] = await pool.query(
      `
      SELECT
        p.id,
        p.name,
        p.slug,
        COUNT(DISTINCT dp.doctor_id) AS popularity
      FROM procedures p
      JOIN doctor_procedure dp ON dp.procedure_id = p.id
      JOIN doctors d ON d.id = dp.doctor_id
      WHERE d.city_id = ?
      GROUP BY p.id
      ORDER BY popularity DESC
      LIMIT ?
      `,
      [cityId, Number(limit)]
    );

    return res.json({
      top_doctors: topDoctors,
      top_hospitals: topHospitals,
      top_clinics: topClinics,
      top_services: topServices,
      top_procedures: topProcedures,
    });

  } catch (err) {
    console.error("❌ searchDiscover error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
