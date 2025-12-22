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

    /* ===================== INTENT SUGGESTIONS (NEW) ===================== */
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
        `SELECT name, slug, 'doctor' AS type
         FROM doctors
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
        searchValues
      ),
      safe(
        `SELECT name, slug, 'hospital' AS type
         FROM hospitals
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
        searchValues
      ),
      safe(
        `SELECT name, slug, 'clinic' AS type
         FROM clinics
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
        searchValues
      ),
      safe(
        `SELECT name, slug, 'specialization' AS type
         FROM specializations
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
        searchValues
      ),
      safe(
        `SELECT name, slug, 'service' AS type
         FROM services
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
        searchValues
      ),
      safe(
        `SELECT name, slug, 'symptom' AS type
         FROM symptoms
         WHERE ${buildWhereClause("name")}
         LIMIT 5`,
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


// export const getSearchDetails = async (req, res) => {
//   try {
//     const {
//       type,
//       slug,
//       city,
//       area,
//       limit = 20,
//       profile = "false",
//     } = req.query;

//     console.log("🔥 SEARCH DETAILS HIT", { query: req.query });

//     if (!type) {
//       return res.status(400).json({ error: "type is required" });
//     }

//     const isProfile = profile === "true";
//     const params = [];

//     /* =====================================================
//        1️⃣ LOCATION RESOLUTION
//     ===================================================== */
//     let cityId = null;
//     let areaId = null;

//     if (city) {
//       const [cityRows] = await pool.query(
//         `SELECT id FROM cities WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [city]
//       );
//       cityId = cityRows?.[0]?.id || null;
//     }

//     if (area) {
//       const [areaRows] = await pool.query(
//         `SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
//         [area]
//       );
//       areaId = areaRows?.[0]?.id || null;
//     }

//     /* =====================================================
//        2️⃣ PROFILE FETCH (DOCTOR / HOSPITAL / CLINIC)
//     ===================================================== */
//     if (isProfile && slug && ["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;

//       // 🔐 SLUG → ID
//       const [idRows] = await pool.query(
//         `SELECT id FROM ${table} WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [slug]
//       );

//       const idRow = idRows?.[0];
//       if (!idRow) {
//         // return res.json({
//         //   type,
//         //   items: [],
//         //   meta: { single: true, count: 0 },
//         // });
//         return sendResponse(res, {
//           type,
//           items: [],
//           meta: { single: false, count: 0 },
//         });

//       }

//       let specializationJoin = "";
//       if (type === "doctor") {
//         specializationJoin = `
//           LEFT JOIN doctor_specialization ds 
//             ON ds.doctor_id = t.id AND ds.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = ds.specialization_id
//         `;
//       } else if (type === "hospital") {
//         specializationJoin = `
//           LEFT JOIN hospital_specialization hs 
//             ON hs.hospital_id = t.id AND hs.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = hs.specialization_id
//         `;
//       } else if (type === "clinic") {
//         specializationJoin = `
//           LEFT JOIN clinic_specialization cs 
//             ON cs.clinic_id = t.id AND cs.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = cs.specialization_id
//         `;
//       }

//       const [profileRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name,
//           sp.name AS specialization_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         ${specializationJoin}
//         WHERE t.id = ?
//         LIMIT 1
//         `,
//         [idRow.id]
//       );

//       if (!profileRows.length) {
//         // return res.json({
//         //   type,
//         //   items: [],
//         //   meta: { single: true, count: 0 },
//         // });
//         return sendResponse(res, {
//           type,
//           items: [],
//           meta: { single: true, count: 0 },
//         });

//       }

//       const item = profileRows[0];

//       /* =====================================================
//          3️⃣ DOCTOR → HOSPITAL / CLINIC
//       ===================================================== */
//       if (type === "doctor") {
//         const [clinicRows] = await pool.query(
//           `
//           SELECT cl.*, dc.consultation_fee, dc.timings, dc.is_primary
//           FROM doctor_clinic dc
//           JOIN clinics cl ON cl.id = dc.clinic_id
//           WHERE dc.doctor_id = ?
//           ORDER BY dc.is_primary DESC
//           `,
//           [item.id]
//         );

//         const [hospitalRows] = await pool.query(
//           `
//           SELECT h.*, dh.consultation_fee, dh.timings, dh.is_primary
//           FROM doctor_hospital dh
//           JOIN hospitals h ON h.id = dh.hospital_id
//           WHERE dh.doctor_id = ?
//           ORDER BY dh.is_primary DESC
//           `,
//           [item.id]
//         );

//         item.clinics = clinicRows;
//         item.hospitals = hospitalRows;
//       }

//       /* =====================================================
//          4️⃣ HOSPITAL → DOCTORS
//       ===================================================== */
//       if (type === "hospital") {
//         const [doctorRows] = await pool.query(
//           `
//           SELECT 
//             d.*,
//             dh.consultation_fee,
//             dh.timings,
//             dh.is_primary,
//             a.name AS area_name,
//             c.name AS city_name,
//             s.name AS state_name
//           FROM doctor_hospital dh
//           JOIN doctors d ON d.id = dh.doctor_id
//           LEFT JOIN areas a ON a.id = d.area_id
//           LEFT JOIN cities c ON c.id = d.city_id
//           LEFT JOIN states s ON s.id = c.state_id
//           WHERE dh.hospital_id = ?
//           ORDER BY dh.is_primary DESC, d.name ASC
//           `,
//           [item.id]
//         );

//         item.doctors = doctorRows;
//       }

//       /* =====================================================
//          5️⃣ CLINIC → DOCTORS
//       ===================================================== */
//       if (type === "clinic") {
//         const [doctorRows] = await pool.query(
//           `
//           SELECT 
//             d.*,
//             dc.consultation_fee,
//             dc.timings,
//             dc.is_primary,
//             a.name AS area_name,
//             c.name AS city_name,
//             s.name AS state_name
//           FROM doctor_clinic dc
//           JOIN doctors d ON d.id = dc.doctor_id
//           LEFT JOIN areas a ON a.id = d.area_id
//           LEFT JOIN cities c ON c.id = d.city_id
//           LEFT JOIN states s ON s.id = c.state_id
//           WHERE dc.clinic_id = ?
//           ORDER BY dc.is_primary DESC, d.name ASC
//           `,
//           [item.id]
//         );

//         item.doctors = doctorRows;
//       }

//       // return res.json({
//       //   type,
//       //   items: [item],
//       //   meta: { single: true, count: 1 },
//       // });
//       return sendResponse(res, {
//         type,
//         items: [item],
//         meta: { single: true, count: 1 },
//       });

//     }

//     /* =====================================================
//        6️⃣ LIST MODE (DOCTOR / HOSPITAL / CLINIC)
//     ===================================================== */
//     if (["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;
//       let where = "WHERE 1=1";

//       if (cityId) {
//         where += " AND t.city_id = ?";
//         params.push(cityId);
//       }

//       if (areaId) {
//         where += " AND t.area_id = ?";
//         params.push(areaId);
//       }

//       const [listRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         ${where}
//         ORDER BY t.name ASC
//         LIMIT ?
//         `,
//         [...params, Number(limit)]
//       );

//       // return res.json({
//       //   type,
//       //   items: listRows,
//       //   meta: { single: false, count: listRows.length },
//       // });
//       return sendResponse(res, {
//         type,
//         items: listRows,
//         meta: { single: false, count: listRows.length },
//       });

//     }

//     return res.status(400).json({ error: "Invalid type" });
//   } catch (error) {
//     console.error("❌ getSearchDetails error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };



// export const getSearchDetails = async (req, res) => {
//   try {
//     const {
//       type,
//       slug,
//       city,
//       area,
//       limit = 20,
//       profile = "false",
//     } = req.query;

//     console.log("🔥 SEARCH DETAILS HIT", { query: req.query });

//     if (!type) {
//       return res.status(400).json({ error: "type is required" });
//     }

//     const isProfile = profile === "true";
//     const params = [];

//     /* =====================================================
//        1️⃣ LOCATION RESOLUTION
//     ===================================================== */
//     let cityId = null;
//     let areaId = null;

//     if (city) {
//       const [cityRows] = await pool.query(
//         `SELECT id FROM cities WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [city]
//       );
//       cityId = cityRows?.[0]?.id || null;
//     }

//     if (area) {
//       const [areaRows] = await pool.query(
//         `SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
//         [area]
//       );
//       areaId = areaRows?.[0]?.id || null;
//     }

//     /* =====================================================
//        2️⃣ PROFILE FETCH (DOCTOR / HOSPITAL / CLINIC)
//     ===================================================== */
//     if (isProfile && slug && ["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;

//       // 🔐 SLUG → ID
//       const [idRows] = await pool.query(
//         `SELECT id FROM ${table} WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [slug]
//       );

//       const idRow = idRows?.[0];
//       if (!idRow) {
//         return res.json({
//           type,
//           items: [],
//           meta: { single: true, count: 0 },
//         });
//       }

//       let specializationJoin = "";
//       if (type === "doctor") {
//         specializationJoin = `
//           LEFT JOIN doctor_specialization ds 
//             ON ds.doctor_id = t.id AND ds.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = ds.specialization_id
//         `;
//       } else if (type === "hospital") {
//         specializationJoin = `
//           LEFT JOIN hospital_specialization hs 
//             ON hs.hospital_id = t.id AND hs.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = hs.specialization_id
//         `;
//       } else if (type === "clinic") {
//         specializationJoin = `
//           LEFT JOIN clinic_specialization cs 
//             ON cs.clinic_id = t.id AND cs.is_primary = 1
//           LEFT JOIN specializations sp 
//             ON sp.id = cs.specialization_id
//         `;
//       }

//       const [profileRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name,
//           sp.name AS specialization_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         ${specializationJoin}
//         WHERE t.id = ?
//         LIMIT 1
//         `,
//         [idRow.id]
//       );

//       if (!profileRows.length) {
//         return res.json({
//           type,
//           items: [],
//           meta: { single: true, count: 0 },
//         });
//       }

//       const item = profileRows[0];

//       /* =====================================================
//          3️⃣ DOCTOR → HOSPITAL / CLINIC
//       ===================================================== */
//       if (type === "doctor") {
//         const [clinicRows] = await pool.query(
//           `
//           SELECT cl.*, dc.consultation_fee, dc.timings, dc.is_primary
//           FROM doctor_clinic dc
//           JOIN clinics cl ON cl.id = dc.clinic_id
//           WHERE dc.doctor_id = ?
//           ORDER BY dc.is_primary DESC
//           `,
//           [item.id]
//         );

//         const [hospitalRows] = await pool.query(
//           `
//           SELECT h.*, dh.consultation_fee, dh.timings, dh.is_primary
//           FROM doctor_hospital dh
//           JOIN hospitals h ON h.id = dh.hospital_id
//           WHERE dh.doctor_id = ?
//           ORDER BY dh.is_primary DESC
//           `,
//           [item.id]
//         );

//         item.clinics = clinicRows;
//         item.hospitals = hospitalRows;
//       }

//       /* =====================================================
//          4️⃣ HOSPITAL → DOCTORS
//       ===================================================== */
//       if (type === "hospital") {
//         const [doctorRows] = await pool.query(
//           `
//           SELECT 
//             d.*,
//             dh.consultation_fee,
//             dh.timings,
//             dh.is_primary,
//             a.name AS area_name,
//             c.name AS city_name,
//             s.name AS state_name
//           FROM doctor_hospital dh
//           JOIN doctors d ON d.id = dh.doctor_id
//           LEFT JOIN areas a ON a.id = d.area_id
//           LEFT JOIN cities c ON c.id = d.city_id
//           LEFT JOIN states s ON s.id = c.state_id
//           WHERE dh.hospital_id = ?
//           ORDER BY dh.is_primary DESC, d.name ASC
//           `,
//           [item.id]
//         );

//         item.doctors = doctorRows;
//       }

//       /* =====================================================
//          5️⃣ CLINIC → DOCTORS
//       ===================================================== */
//       if (type === "clinic") {
//         const [doctorRows] = await pool.query(
//           `
//           SELECT 
//             d.*,
//             dc.consultation_fee,
//             dc.timings,
//             dc.is_primary,
//             a.name AS area_name,
//             c.name AS city_name,
//             s.name AS state_name
//           FROM doctor_clinic dc
//           JOIN doctors d ON d.id = dc.doctor_id
//           LEFT JOIN areas a ON a.id = d.area_id
//           LEFT JOIN cities c ON c.id = d.city_id
//           LEFT JOIN states s ON s.id = c.state_id
//           WHERE dc.clinic_id = ?
//           ORDER BY dc.is_primary DESC, d.name ASC
//           `,
//           [item.id]
//         );

//         item.doctors = doctorRows;
//       }

//       return res.json({
//         type,
//         items: [item],
//         meta: { single: true, count: 1 },
//       });
//     }

//     /* =====================================================
//        6️⃣ LIST MODE (DOCTOR / HOSPITAL / CLINIC)
//     ===================================================== */
//     if (["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;
//       let where = "WHERE 1=1";

//       if (cityId) {
//         where += " AND t.city_id = ?";
//         params.push(cityId);
//       }

//       if (areaId) {
//         where += " AND t.area_id = ?";
//         params.push(areaId);
//       }

//       const [listRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         ${where}
//         ORDER BY t.name ASC
//         LIMIT ?
//         `,
//         [...params, Number(limit)]
//       );

//       return res.json({
//         type,
//         items: listRows,
//         meta: { single: false, count: listRows.length },
//       });
//     }

//     return res.status(400).json({ error: "Invalid type" });
//   } catch (error) {
//     console.error("❌ getSearchDetails error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };


// export const getSearchDetails = async (req, res) => {
//   try {
//     const {
//       type,
//       slug,
//       city,
//       area,
//       limit = 20,
//       profile = "false",
//     } = req.query;

//     console.log("🔥 SEARCH DETAILS HIT", { query: req.query });

//     if (!type) {
//       return res.status(400).json({ error: "type is required" });
//     }

//     const isProfile = profile === "true";
//     const params = [];

//     /* =====================================================
//        1️⃣ LOCATION RESOLUTION
//     ===================================================== */
//     let cityId = null;
//     let areaId = null;

//     if (city) {
//       const [cityRows] = await pool.query(
//         `SELECT id FROM cities WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [city]
//       );
//       cityId = cityRows?.[0]?.id || null;
//     }

//     if (area) {
//       const [areaRows] = await pool.query(
//         `SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
//         [area]
//       );
//       areaId = areaRows?.[0]?.id || null;
//     }

//     /* =====================================================
//        2️⃣ PROFILE FETCH
//     ===================================================== */
//     if (isProfile && slug && ["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;

//       const [idRows] = await pool.query(
//         `SELECT id FROM ${table} WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
//         [slug]
//       );

//       const idRow = idRows?.[0];
//       if (!idRow) {
//         return res.json(
//           buildResponse({
//             type,
//             items: [],
//             meta: { single: true, count: 0 },
//           })
//         );
//       }

//       const [profileRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         WHERE t.id = ?
//         LIMIT 1
//         `,
//         [idRow.id]
//       );

//       if (!profileRows.length) {
//         return res.json(
//           buildResponse({
//             type,
//             items: [],
//             meta: { single: true, count: 0 },
//           })
//         );
//       }

//       return res.json(
//         buildResponse({
//           type,
//           items: [profileRows[0]],
//           meta: { single: true, count: 1 },
//         })
//       );
//     }

//     /* =====================================================
//        3️⃣ LIST MODE (NO SCROLL, NO INTENT)
//     ===================================================== */
//     if (["doctor", "hospital", "clinic"].includes(type)) {
//       const table = `${type}s`;
//       let where = "WHERE 1=1";

//       if (cityId) {
//         where += " AND t.city_id = ?";
//         params.push(cityId);
//       }

//       if (areaId) {
//         where += " AND t.area_id = ?";
//         params.push(areaId);
//       }

//       const [listRows] = await pool.query(
//         `
//         SELECT 
//           t.*,
//           a.name AS area_name,
//           c.name AS city_name,
//           s.name AS state_name
//         FROM ${table} t
//         LEFT JOIN areas a ON a.id = t.area_id
//         LEFT JOIN cities c ON c.id = t.city_id
//         LEFT JOIN states s ON s.id = c.state_id
//         ${where}
//         ORDER BY t.name ASC
//         LIMIT ?
//         `,
//         [...params, Number(limit)]
//       );

//       return res.json(
//         buildResponse({
//           type,
//           items: listRows,
//           meta: { single: false, count: listRows.length },
//         })
//       );
//     }

//     return res.status(400).json({ error: "Invalid type" });
//   } catch (error) {
//     console.error("❌ getSearchDetails error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };



const encodeCursor = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64");

const decodeCursor = (cursor) => {
  try {
    return JSON.parse(Buffer.from(cursor, "base64").toString());
  } catch {
    return null;
  }
};




export const searchByIntent = async (req, res) => {
  try {
    const { q, city, area, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({ error: "q (keyword) is required" });
    }

    const keyword = q.trim().toLowerCase();
    const normalizedName = keyword.replace(/-/g, " ");
    const params = [];

    /* =====================================================
       1️⃣ LOCATION RESOLUTION
    ===================================================== */
    let cityId = null;
    let areaId = null;

    if (city) {
      const [[c]] = await pool.query(
        `SELECT id FROM cities WHERE LOWER(slug) = LOWER(?) OR LOWER(name) = LOWER(?) LIMIT 1`,
        [city, city]
      );
      cityId = c?.id || null;
    }

    if (area) {
      const [[a]] = await pool.query(
        `SELECT id FROM areas WHERE LOWER(slug) = LOWER(?) LIMIT 1`,
        [area]
      );
      areaId = a?.id || null;
    }

    /* =====================================================
       2️⃣ SEARCH INTENT (doctor / hospital / clinic / others)
    ===================================================== */
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

    /* =====================================================
       🔥 3️⃣ PURE INTENT HANDLING (NO entity_id)
       doctors / hospitals / clinics
    ===================================================== */
    if (intent && ["doctor", "hospital", "clinic"].includes(entity_type)) {
      /* -------- DOCTORS -------- */
      if (entity_type === "doctor") {
        let where = "WHERE 1=1";
        const qParams = [];

        if (cityId) {
          where += " AND d.city_id = ?";
          qParams.push(cityId);
        }

        const [doctors] = await pool.query(
          `
          SELECT 
            d.id,
            d.name,
            d.slug,
            d.image_url,
            d.experience_years,
            d.rating,
            d.consultation_fee,
            a.name AS area_name,
            c.name AS city_name
          FROM doctors d
          LEFT JOIN areas a ON a.id = d.area_id
          LEFT JOIN cities c ON c.id = d.city_id
          ${where}
          ORDER BY d.rating DESC, d.experience_years DESC
          LIMIT ?
          `,
          [...qParams, Number(limit)]
        );

        return res.json({
          items: doctors,
          meta: { count: doctors.length, intent: "doctor", keyword },
        });
      }

      /* -------- HOSPITALS -------- */
      if (entity_type === "hospital") {
        const [hospitals] = await pool.query(
          `
          SELECT *
          FROM hospitals
          ${cityId ? "WHERE city_id = ?" : ""}
          LIMIT ?
          `,
          cityId ? [cityId, Number(limit)] : [Number(limit)]
        );

        return res.json({
          items: hospitals,
          meta: { count: hospitals.length, intent: "hospital", keyword },
        });
      }

      /* -------- CLINICS -------- */
      if (entity_type === "clinic") {
        const [clinics] = await pool.query(
          `
          SELECT *
          FROM clinics
          ${cityId ? "WHERE city_id = ?" : ""}
          LIMIT ?
          `,
          cityId ? [cityId, Number(limit)] : [Number(limit)]
        );

        return res.json({
          items: clinics,
          meta: { count: clinics.length, intent: "clinic", keyword },
        });
      }
    }

    /* =====================================================
       4️⃣ FALLBACK ENTITY RESOLUTION
       (specialization / symptom / service / procedure)
    ===================================================== */
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

    if (!entity_id) {
      return res.json({
        items: [],
        meta: { count: 0, intent: null, keyword },
      });
    }

    /* =====================================================
       5️⃣ ENTITY → DOCTOR MAP
    ===================================================== */
    const map = {
      specialization: "doctor_specialization",
      service: "doctor_service",
      procedure: "doctor_procedure",
      symptom: "doctor_symptom",
    };

    let where = "WHERE 1=1";

    if (cityId) {
      where += " AND d.city_id = ?";
      params.push(cityId);
    }

    /* =====================================================
       6️⃣ FETCH DOCTORS
    ===================================================== */
    const [doctors] = await pool.query(
      `
      SELECT DISTINCT
        d.id,
        d.name,
        d.slug,
        d.image_url,
        d.experience_years,
        d.rating,
        d.consultation_fee,
        a.name AS area_name,
        c.name AS city_name,
        sp.name AS specialization_name
      FROM doctors d
      JOIN ${map[entity_type]} m
        ON m.doctor_id = d.id
      LEFT JOIN doctor_specialization ds
        ON ds.doctor_id = d.id AND ds.is_primary = 1
      LEFT JOIN specializations sp
        ON sp.id = ds.specialization_id
      LEFT JOIN areas a ON a.id = d.area_id
      LEFT JOIN cities c ON c.id = d.city_id
      ${where}
        AND m.${entity_type}_id = ?
      ORDER BY d.rating DESC, d.experience_years DESC
      LIMIT ?
      `,
      [...params, entity_id, Number(limit)]
    );

    /* =====================================================
       7️⃣ RESPONSE
    ===================================================== */
    return res.json({
      items: doctors,
      meta: {
        count: doctors.length,
        intent: entity_type,
        keyword,
      },
    });
  } catch (error) {
    console.error("❌ searchByIntent error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

export const getSearchDetails = async (req, res) => {
  try {
    const {
      type,
      slug,
      city,
      area,
      limit = 20,
      profile = "false",
    } = req.query;

    console.log("🔥 SEARCH DETAILS HIT", { query: req.query });

    if (!type) {
      return res.status(400).json({ error: "type is required" });
    }

    const isProfile = profile === "true";
    const params = [];

    /* =====================================================
       1️⃣ LOCATION RESOLUTION
    ===================================================== */
    let cityId = null;
    let areaId = null;

    if (city) {
      const [cityRows] = await pool.query(
        `SELECT id FROM cities WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
        [city]
      );
      cityId = cityRows?.[0]?.id || null;
    }

    if (area) {
      const [areaRows] = await pool.query(
        `SELECT id FROM areas WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 1`,
        [area]
      );
      areaId = areaRows?.[0]?.id || null;
    }

    /* =====================================================
       2️⃣ PROFILE FETCH (DOCTOR / HOSPITAL / CLINIC)
    ===================================================== */
    if (isProfile && slug && ["doctor", "hospital", "clinic"].includes(type)) {
      const table = `${type}s`;

      // 🔐 SLUG → ID
      const [idRows] = await pool.query(
        `SELECT id FROM ${table} WHERE LOWER(TRIM(slug)) = LOWER(TRIM(?)) LIMIT 1`,
        [slug]
      );

      const idRow = idRows?.[0];
      if (!idRow) {
        return res.json({
          type,
          items: [],
          meta: { single: true, count: 0 },
        });
      }

      let specializationJoin = "";
      if (type === "doctor") {
        specializationJoin = `
          LEFT JOIN doctor_specialization ds 
            ON ds.doctor_id = t.id AND ds.is_primary = 1
          LEFT JOIN specializations sp 
            ON sp.id = ds.specialization_id
        `;
      } else if (type === "hospital") {
        specializationJoin = `
          LEFT JOIN hospital_specialization hs 
            ON hs.hospital_id = t.id AND hs.is_primary = 1
          LEFT JOIN specializations sp 
            ON sp.id = hs.specialization_id
        `;
      } else if (type === "clinic") {
        specializationJoin = `
          LEFT JOIN clinic_specialization cs 
            ON cs.clinic_id = t.id AND cs.is_primary = 1
          LEFT JOIN specializations sp 
            ON sp.id = cs.specialization_id
        `;
      }

      const [profileRows] = await pool.query(
        `
        SELECT 
          t.*,
          a.name AS area_name,
          c.name AS city_name,
          s.name AS state_name,
          sp.name AS specialization_name
        FROM ${table} t
        LEFT JOIN areas a ON a.id = t.area_id
        LEFT JOIN cities c ON c.id = t.city_id
        LEFT JOIN states s ON s.id = c.state_id
        ${specializationJoin}
        WHERE t.id = ?
        LIMIT 1
        `,
        [idRow.id]
      );

      if (!profileRows.length) {
        return res.json({
          type,
          items: [],
          meta: { single: true, count: 0 },
        });
      }

      const item = profileRows[0];

      /* =====================================================
         3️⃣ DOCTOR → HOSPITAL / CLINIC
      ===================================================== */
      if (type === "doctor") {
        const [clinicRows] = await pool.query(
          `
          SELECT cl.*, dc.consultation_fee, dc.timings, dc.is_primary
          FROM doctor_clinic dc
          JOIN clinics cl ON cl.id = dc.clinic_id
          WHERE dc.doctor_id = ?
          ORDER BY dc.is_primary DESC
          `,
          [item.id]
        );

        const [hospitalRows] = await pool.query(
          `
          SELECT h.*, dh.consultation_fee, dh.timings, dh.is_primary
          FROM doctor_hospital dh
          JOIN hospitals h ON h.id = dh.hospital_id
          WHERE dh.doctor_id = ?
          ORDER BY dh.is_primary DESC
          `,
          [item.id]
        );

        item.clinics = clinicRows;
        item.hospitals = hospitalRows;
      }

      /* =====================================================
         4️⃣ HOSPITAL → DOCTORS
      ===================================================== */
      if (type === "hospital") {
        const [doctorRows] = await pool.query(
          `
          SELECT 
            d.*,
            dh.consultation_fee,
            dh.timings,
            dh.is_primary,
            a.name AS area_name,
            c.name AS city_name,
            s.name AS state_name
          FROM doctor_hospital dh
          JOIN doctors d ON d.id = dh.doctor_id
          LEFT JOIN areas a ON a.id = d.area_id
          LEFT JOIN cities c ON c.id = d.city_id
          LEFT JOIN states s ON s.id = c.state_id
          WHERE dh.hospital_id = ?
          ORDER BY dh.is_primary DESC, d.name ASC
          `,
          [item.id]
        );

        item.doctors = doctorRows;
      }

      /* =====================================================
         5️⃣ CLINIC → DOCTORS
      ===================================================== */
      if (type === "clinic") {
        const [doctorRows] = await pool.query(
          `
          SELECT 
            d.*,
            dc.consultation_fee,
            dc.timings,
            dc.is_primary,
            a.name AS area_name,
            c.name AS city_name,
            s.name AS state_name
          FROM doctor_clinic dc
          JOIN doctors d ON d.id = dc.doctor_id
          LEFT JOIN areas a ON a.id = d.area_id
          LEFT JOIN cities c ON c.id = d.city_id
          LEFT JOIN states s ON s.id = c.state_id
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

    /* =====================================================
       6️⃣ LIST MODE (DOCTOR / HOSPITAL / CLINIC)
    ===================================================== */
    if (["doctor", "hospital", "clinic"].includes(type)) {
      const table = `${type}s`;
      let where = "WHERE 1=1";

      if (cityId) {
        where += " AND t.city_id = ?";
        params.push(cityId);
      }

      if (areaId) {
        where += " AND t.area_id = ?";
        params.push(areaId);
      }

      const [listRows] = await pool.query(
        `
        SELECT 
          t.*,
          a.name AS area_name,
          c.name AS city_name,
          s.name AS state_name
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
        items: listRows,
        meta: { single: false, count: listRows.length },
      });
    }

    return res.status(400).json({ error: "Invalid type" });
  } catch (error) {
    console.error("❌ getSearchDetails error:", error);
    res.status(500).json({ error: "Server error" });
  }
};





// export const searchByIntent = async (req, res) => {
//   try {
//     const { q, city, area, limit = 20, cursor } = req.query;

//     if (!q) {
//       return res.status(400).json({ error: "q (keyword) is required" });
//     }

//     const keyword = q.trim().toLowerCase();
//     const normalizedName = keyword.replace(/-/g, " ");
//     const params = [];

//     // 🔐 cursor handling (NEW, safe)
//     const decoded = cursor ? decodeCursor(cursor) : null;
//     const lastId = decoded?.lastId || 0;

//     /* =====================================================
//        1️⃣ LOCATION RESOLUTION
//     ===================================================== */
//     let cityId = null;
//     let areaId = null;

//     if (city) {
//       const [[c]] = await pool.query(
//         `SELECT id FROM cities WHERE LOWER(slug) = LOWER(?) OR LOWER(name) = LOWER(?) LIMIT 1`,
//         [city, city]
//       );
//       cityId = c?.id || null;
//     }

//     if (area) {
//       const [[a]] = await pool.query(
//         `SELECT id FROM areas WHERE LOWER(slug) = LOWER(?) LIMIT 1`,
//         [area]
//       );
//       areaId = a?.id || null;
//     }

//     /* =====================================================
//        2️⃣ SEARCH INTENT
//     ===================================================== */
//     let entity_type = null;
//     let entity_id = null;

//     const [[intent]] = await pool.query(
//       `
//       SELECT entity_type, entity_id
//       FROM search_intents
//       WHERE keyword = ?
//         AND status = 1
//       ORDER BY priority DESC
//       LIMIT 1
//       `,
//       [keyword]
//     );

//     if (intent) {
//       entity_type = intent.entity_type;
//       entity_id = intent.entity_id;
//     }

//     /* =====================================================
//        3️⃣ PURE INTENT (doctor / hospital / clinic)
//     ===================================================== */
//     if (intent && ["doctor", "hospital", "clinic"].includes(entity_type)) {

//       /* -------- DOCTOR -------- */
//       if (entity_type === "doctor") {
//         let where = "WHERE d.id > ?";
//         const qParams = [lastId];

//         if (cityId) {
//           where += " AND d.city_id = ?";
//           qParams.push(cityId);
//         }

//         const [doctors] = await pool.query(
//           `
//           SELECT 
//             d.id,
//             d.name,
//             d.slug,
//             d.image_url,
//             d.experience_years,
//             d.rating,
//             d.consultation_fee,
//             a.name AS area_name,
//             c.name AS city_name
//           FROM doctors d
//           LEFT JOIN areas a ON a.id = d.area_id
//           LEFT JOIN cities c ON c.id = d.city_id
//           ${where}
//           ORDER BY d.id ASC
//           LIMIT ?
//           `,
//           [...qParams, Number(limit)]
//         );

//         const nextCursor =
//           doctors.length === Number(limit)
//             ? encodeCursor({ lastId: doctors[doctors.length - 1].id })
//             : null;

//         return sendResponse(res, {
//           items: doctors,
//           meta: {
//             count: doctors.length,
//             intent: "doctor",
//             keyword,
//             nextCursor,
//           },
//         });
//       }

//       /* -------- HOSPITAL -------- */
//       if (entity_type === "hospital") {
//         const [hospitals] = await pool.query(
//           `
//           SELECT *
//           FROM hospitals
//           ${cityId ? "WHERE city_id = ?" : ""}
//           LIMIT ?
//           `,
//           cityId ? [cityId, Number(limit)] : [Number(limit)]
//         );

//         return sendResponse(res, {
//           items: hospitals,
//           meta: { count: hospitals.length, intent: "hospital", keyword },
//         });
//       }

//       /* -------- CLINIC -------- */
//       if (entity_type === "clinic") {
//         const [clinics] = await pool.query(
//           `
//           SELECT *
//           FROM clinics
//           ${cityId ? "WHERE city_id = ?" : ""}
//           LIMIT ?
//           `,
//           cityId ? [cityId, Number(limit)] : [Number(limit)]
//         );

//         return sendResponse(res, {
//           items: clinics,
//           meta: { count: clinics.length, intent: "clinic", keyword },
//         });
//       }
//     }

//     /* =====================================================
//        4️⃣ FALLBACK ENTITY RESOLUTION
//     ===================================================== */
//     if (!entity_id) {
//       const fallbacks = [
//         { type: "specialization", table: "specializations" },
//         { type: "symptom", table: "symptoms" },
//         { type: "service", table: "services" },
//         { type: "procedure", table: "procedures" },
//       ];

//       for (const fb of fallbacks) {
//         const [[row]] = await pool.query(
//           `
//           SELECT id
//           FROM ${fb.table}
//           WHERE slug = ?
//              OR LOWER(name) = ?
//           LIMIT 1
//           `,
//           [keyword, normalizedName]
//         );

//         if (row) {
//           entity_type = fb.type;
//           entity_id = row.id;
//           break;
//         }
//       }
//     }

//     if (!entity_id) {
//       return sendResponse(res, {
//         items: [],
//         meta: { count: 0, intent: null, keyword },
//       });
//     }

//     /* =====================================================
//        5️⃣ ENTITY → DOCTOR MAP
//     ===================================================== */
//     const map = {
//       specialization: "doctor_specialization",
//       service: "doctor_service",
//       procedure: "doctor_procedure",
//       symptom: "doctor_symptom",
//     };

//     let where = "WHERE d.id > ?";
//     params.push(lastId);

//     if (cityId) {
//       where += " AND d.city_id = ?";
//       params.push(cityId);
//     }

//     /* =====================================================
//        6️⃣ FETCH DOCTORS
//     ===================================================== */
//     const [doctors] = await pool.query(
//       `
//       SELECT DISTINCT
//         d.id,
//         d.name,
//         d.slug,
//         d.image_url,
//         d.experience_years,
//         d.rating,
//         d.consultation_fee,
//         a.name AS area_name,
//         c.name AS city_name,
//         sp.name AS specialization_name
//       FROM doctors d
//       JOIN ${map[entity_type]} m
//         ON m.doctor_id = d.id
//       LEFT JOIN doctor_specialization ds
//         ON ds.doctor_id = d.id AND ds.is_primary = 1
//       LEFT JOIN specializations sp
//         ON sp.id = ds.specialization_id
//       LEFT JOIN areas a ON a.id = d.area_id
//       LEFT JOIN cities c ON c.id = d.city_id
//       ${where}
//         AND m.${entity_type}_id = ?
//       ORDER BY d.id ASC
//       LIMIT ?
//       `,
//       [...params, entity_id, Number(limit)]
//     );

//     const nextCursor =
//       doctors.length === Number(limit)
//         ? encodeCursor({ lastId: doctors[doctors.length - 1].id })
//         : null;

//     /* =====================================================
//        7️⃣ RESPONSE
//     ===================================================== */
//     return sendResponse(res, {
//       items: doctors,
//       meta: {
//         count: doctors.length,
//         intent: entity_type,
//         keyword,
//         nextCursor,
//       },
//     });
//   } catch (error) {
//     console.error("❌ searchByIntent error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };
