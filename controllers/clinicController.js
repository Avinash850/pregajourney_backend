import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/**
 * GET /api/clinics
 * Lightweight list + mapping IDs
 */
export const getClinics = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    const where = [];
    const params = [];

    /* ---------------- SOFT DELETE FILTER ---------------- */
    where.push(`deleted_at IS NULL`);

    /* ---------------- DATE FILTER ---------------- */
    if (from_date && to_date) {
      where.push(`created_at BETWEEN ? AND ?`);
      params.push(
        `${from_date} 00:00:00`,
        `${to_date} 23:59:59`
      );
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    /* ---------------- MAIN QUERY ---------------- */
    const [clinics] = await pool.query(
      `SELECT * FROM clinics ${whereSql} ORDER BY id DESC`,
      params
    );

    if (!clinics || clinics.length === 0) {
      return res.json([]);
    }

    const ids = clinics.map(c => c.id);

    /* ---------------- RELATIONS ---------------- */
    const [specializations] = await pool.query(
      `SELECT clinic_id, specialization_id AS id
       FROM clinic_specialization
       WHERE clinic_id IN (?)`,
      [ids]
    );

    const [services] = await pool.query(
      `SELECT clinic_id, service_id AS id
       FROM clinic_service
       WHERE clinic_id IN (?)`,
      [ids]
    );

    const [procedures] = await pool.query(
      `SELECT clinic_id, procedure_id AS id
       FROM clinic_procedure
       WHERE clinic_id IN (?)`,
      [ids]
    );

    const [symptoms] = await pool.query(
      `SELECT clinic_id, symptom_id AS id
       FROM clinic_symptom
       WHERE clinic_id IN (?)`,
      [ids]
    );

    const [doctors] = await pool.query(
      `SELECT clinic_id, doctor_id AS id
       FROM doctor_clinic
       WHERE clinic_id IN (?)`,
      [ids]
    );

    /* ---------------- FINAL RESPONSE ---------------- */
    const response = clinics.map(c => ({
      ...c,
      specializations: specializations.filter(x => x.clinic_id === c.id).map(x => x.id),
      services: services.filter(x => x.clinic_id === c.id).map(x => x.id),
      procedures: procedures.filter(x => x.clinic_id === c.id).map(x => x.id),
      symptoms: symptoms.filter(x => x.clinic_id === c.id).map(x => x.id),
      doctors: doctors.filter(x => x.clinic_id === c.id).map(x => x.id),
    }));

    res.json(response);

  } catch (err) {
    console.error("❌ getClinics Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * GET /api/clinics/:id
 * Full clinic details + relations (id + name)
 */
export const getClinicById = async (req, res) => {
  const { id } = req.params;

  try {
    const [[clinic]] = await pool.query(`SELECT * FROM clinics WHERE id = ?`, [id]);

    if (!clinic) return res.status(404).json({ error: "Clinic not found" });

    const [specializations] = await pool.query(
      `SELECT cs.specialization_id AS id, s.name
       FROM clinic_specialization cs
       JOIN specializations s ON s.id = cs.specialization_id
       WHERE cs.clinic_id = ?`,
      [id]
    );

    const [services] = await pool.query(
      `SELECT cs.service_id AS id, s.name
       FROM clinic_service cs
       JOIN services s ON s.id = cs.service_id
       WHERE cs.clinic_id = ?`,
      [id]
    );

    const [procedures] = await pool.query(
      `SELECT cp.procedure_id AS id, p.name
       FROM clinic_procedure cp
       JOIN procedures p ON p.id = cp.procedure_id
       WHERE cp.clinic_id = ?`,
      [id]
    );

    const [symptoms] = await pool.query(
      `SELECT cs.symptom_id AS id, s.name
       FROM clinic_symptom cs
       JOIN symptoms s ON s.id = cs.symptom_id
       WHERE cs.clinic_id = ?`,
      [id]
    );

    const [doctors] = await pool.query(
      `SELECT dc.doctor_id AS id, d.name
       FROM doctor_clinic dc
       JOIN doctors d ON d.id = dc.doctor_id
       WHERE dc.clinic_id = ?`,
      [id]
    );

    let city = null;
    let area = null;

    if (clinic.city_id) {
      const [c] = await pool.query(`SELECT id, name FROM cities WHERE id = ?`, [clinic.city_id]);
      city = c?.[0] ?? null;
    }

    if (clinic.area_id) {
      const [a] = await pool.query(`SELECT id, name FROM areas WHERE id = ?`, [clinic.area_id]);
      area = a?.[0] ?? null;
    }

    res.json({
      ...clinic,
      specializations,
      services,
      procedures,
      symptoms,
      doctors,
      city,
      area,
    });

  } catch (err) {
    console.error("❌ getClinicById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


// export const createClinic = async (req, res) => {
//   let imageKey = null;

//   try {
//     /* ------------------ IMAGE ------------------ */
//     let imageUrl = null;
//     if (req.file) {
//       const uploaded = await uploadImageToS3(req.file, "clinics");
//       imageUrl = uploaded.imageUrl;
//       imageKey = uploaded.fileKey;
//     }

//     const body = req.body || {};

//     /* ------------------ SLUG ------------------ */
//     const baseSlug = body.name
//       .toLowerCase()
//       .replace(/[^a-z0-9\s-]/g, "")
//       .trim()
//       .replace(/\s+/g, "-");

//     let slug = baseSlug;
//     let counter = 1;

//     while (true) {
//       const [[exists]] = await pool.query(
//         `SELECT id FROM clinics WHERE slug = ? LIMIT 1`,
//         [slug]
//       );
//       if (!exists) break;
//       slug = `${baseSlug}-${counter++}`;
//     }

//     /* ------------------ NORMALIZE ------------------ */
//     const normalize = (v) => {
//       if (!v) return [];
//       if (Array.isArray(v)) return v.map(Number).filter(Boolean);
//       if (typeof v === "string")
//         return v.split(",").map(x => Number(x.trim())).filter(Boolean);
//       return [];
//     };

//     const specializations = normalize(body.specializations);
//     const services = normalize(body.services);
//     const procedures = normalize(body.procedures);
//     const symptoms = normalize(body.symptoms);
//     const doctors = normalize(body.doctors);

//     /* ------------------ INSERT CLINIC ------------------ */
//     const [result] = await pool.query(
//       `INSERT INTO clinics
//        (name, slug, timing, short_description, about,
//         image_url, image_key,
//         phone_1, phone_2, website, address,
//         city_id, area_id, status,
//         seo_title, seo_keywords, seo_description, json_schema)
//        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [
//         body.name || "",
//         slug,
//         body.timing || null,
//         body.short_description || null,
//         body.about || null,
//         imageUrl,
//         imageKey,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.website || null,
//         body.address || null,
//         body.city_id ? Number(body.city_id) : null,
//         body.area_id ? Number(body.area_id) : null,
//         body.status || "active",
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//       ]
//     );

//     const clinicId = result.insertId;

//     /* ------------------ SPECIALIZATIONS ------------------ */
//     if (specializations.length) {
//       const values = specializations.map((sid, idx) => [
//         clinicId,
//         sid,
//         idx === 0 ? 1 : 0
//       ]);

//       await pool.query(
//         `INSERT INTO clinic_specialization
//          (clinic_id, specialization_id, is_primary)
//          VALUES ?`,
//         [values]
//       );
//     }

//     /* ------------------ OTHER RELATIONS ------------------ */
//     const insertMany = async (table, col, ids) => {
//       if (!ids.length) return;
//       const rows = ids.map(x => [clinicId, x]);
//       await pool.query(
//         `INSERT INTO ${table} (clinic_id, ${col}) VALUES ?`,
//         [rows]
//       );
//     };

//     await insertMany("clinic_service", "service_id", services);
//     await insertMany("clinic_procedure", "procedure_id", procedures);
//     await insertMany("clinic_symptom", "symptom_id", symptoms);

//     /* ------------------ DOCTOR ↔ CLINIC ------------------ */
//     if (doctors.length) {
//       const values = doctors.map((did, idx) => [
//         did,
//         clinicId,
//         idx === 0 ? 1 : 0,
//         body.consultation_fee || null,
//         null,
//         null,
//       ]);

//       await pool.query(
//         `INSERT INTO doctor_clinic
//          (doctor_id, clinic_id, is_primary, consultation_fee, timings, practice_address)
//          VALUES ?`,
//         [values]
//       );
//     }

//     res.status(201).json({ id: clinicId, slug });

//   } catch (err) {
//     console.error("❌ createClinic Error:", err);
//     if (imageKey) await deleteFromS3(imageKey);
//     res.status(500).json({ error: "Failed to create clinic" });
//   }
// };


export const createClinic = async (req, res) => {
  let imageKey = null;

  try {
    /* ------------------ IMAGE ------------------ */
    let imageUrl = null;
    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "clinics");
      imageUrl = uploaded.imageUrl;
      imageKey = uploaded.fileKey;
    }

    const body = req.body || {};

    /* ------------------ SLUG (UNCHANGED) ------------------ */
    const baseSlug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const [[exists]] = await pool.query(
        `SELECT id FROM clinics WHERE slug = ? LIMIT 1`,
        [slug]
      );
      if (!exists) break;
      slug = `${baseSlug}-${counter++}`;
    }

    /* ------------------ NORMALIZE ------------------ */
    const normalize = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(Number).filter(Boolean);
      return [];
    };

    const specializations = normalize(body.specializations);
    const services = normalize(body.services);
    const procedures = normalize(body.procedures);
    const symptoms = normalize(body.symptoms);
    const doctors = normalize(body.doctors);

    /* ------------------ INSERT CLINIC ------------------ */
    const [result] = await pool.query(
      `INSERT INTO clinics
       (
        name, slug, timing, short_description, about,
        image_url, image_key,
        phone_1, phone_2, website, address,
        city_id, area_id, status,
        seo_title, seo_keywords, seo_description, json_schema,

        rating, patients_count, patients_stories,
        is_profile_claimed, payment_type, show_call_button, created_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name || "",
        slug,
        body.timing || null,
        body.short_description || null,
        body.about || null,
        imageUrl,
        imageKey,
        body.phone_1 || null,
        body.phone_2 || null,
        body.website || null,
        body.address || null,
        body.city_id ? Number(body.city_id) : null,
        body.area_id ? Number(body.area_id) : null,
        body.status || "active",
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,

        body.rating ? Number(body.rating) : 0,
        body.patients_count ? Number(body.patients_count) : 0,
        body.patients_stories ? Number(body.patients_stories) : 0,
        body.is_profile_claimed ? 1 : 0,
        body.show_call_button ? 1 : 0,
        body.payment_type ? Number(body.payment_type) : 0,
        req.user?.id || "admin"
      ]
    );

    const clinicId = result.insertId;

    /* ------------------ SPECIALIZATIONS ------------------ */
    if (specializations.length) {
      const placeholders = specializations.map(() => "(?, ?, ?)").join(",");
      const values = specializations.flatMap((sid, idx) => [
        clinicId,
        sid,
        idx === 0 ? 1 : 0,
      ]);

      await pool.query(
        `INSERT INTO clinic_specialization
         (clinic_id, specialization_id, is_primary)
         VALUES ${placeholders}`,
        values
      );
    }

    /* ------------------ SERVICES ------------------ */
    if (services.length) {
      const placeholders = services.map(() => "(?, ?)").join(",");
      const values = services.flatMap((sid) => [clinicId, sid]);

      await pool.query(
        `INSERT INTO clinic_service (clinic_id, service_id)
         VALUES ${placeholders}`,
        values
      );
    }

    /* ------------------ PROCEDURES ------------------ */
    if (procedures.length) {
      const placeholders = procedures.map(() => "(?, ?)").join(",");
      const values = procedures.flatMap((pid) => [clinicId, pid]);

      await pool.query(
        `INSERT INTO clinic_procedure (clinic_id, procedure_id)
         VALUES ${placeholders}`,
        values
      );
    }

    /* ------------------ SYMPTOMS ------------------ */
    if (symptoms.length) {
      const placeholders = symptoms.map(() => "(?, ?)").join(",");
      const values = symptoms.flatMap((sid) => [clinicId, sid]);

      await pool.query(
        `INSERT INTO clinic_symptom (clinic_id, symptom_id)
         VALUES ${placeholders}`,
        values
      );
    }

    /* ------------------ DOCTOR ↔ CLINIC ------------------ */
    if (doctors.length) {
      const placeholders = doctors.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
      const values = doctors.flatMap((did, idx) => [
        did,
        clinicId,
        idx === 0 ? 1 : 0,
        body.consultation_fee || null,
        null,
        null,
      ]);

      await pool.query(
        `INSERT INTO doctor_clinic
         (doctor_id, clinic_id, is_primary, consultation_fee, timings, practice_address)
         VALUES ${placeholders}`,
        values
      );
    }

    res.status(201).json({ id: clinicId, slug });

  } catch (err) {
    console.error("❌ createClinic Error:", err);
    if (imageKey) await deleteFromS3(imageKey);
    res.status(500).json({ error: "Failed to create clinic" });
  }
};




/**
 * PUT /api/clinics/:id
 * Update clinic
 */
// export const updateClinic = async (req, res) => {
//   const { id } = req.params;
//   let newImageKey = null;

//   try {
//     const [[existing]] = await pool.query(
//       `SELECT name, slug, image_key FROM clinics WHERE id = ?`,
//       [id]
//     );

//     if (!existing) {
//       return res.status(404).json({ error: "Clinic not found" });
//     }

//     const body = req.body || {};

//     /* ------------------ SLUG ------------------ */
//     let slug = existing.slug;
//     if (body.name && body.name !== existing.name) {
//       const baseSlug = body.name
//         .toLowerCase()
//         .replace(/[^a-z0-9\s-]/g, "")
//         .trim()
//         .replace(/\s+/g, "-");

//       slug = baseSlug;
//       let counter = 1;

//       while (true) {
//         const [[exists]] = await pool.query(
//           `SELECT id FROM clinics WHERE slug = ? AND id != ? LIMIT 1`,
//           [slug, id]
//         );
//         if (!exists) break;
//         slug = `${baseSlug}-${counter++}`;
//       }
//     }

//     /* ------------------ IMAGE ------------------ */
//     let imageUrl = null;
//     if (req.file) {
//       const uploaded = await uploadImageToS3(req.file, "clinics");
//       imageUrl = uploaded.imageUrl;
//       newImageKey = uploaded.fileKey;
//     }

//     /* ------------------ UPDATE CLINIC ------------------ */
//     await pool.query(
//       `UPDATE clinics SET
//         name = ?, slug = ?,
//         timing = ?, short_description = ?, about = ?,
//         phone_1 = ?, phone_2 = ?, website = ?, address = ?,
//         city_id = ?, area_id = ?, status = ?,
//         seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?
//         ${imageUrl ? ", image_url = ?, image_key = ?" : ""}
//        WHERE id = ?`,
//       [
//         body.name || existing.name,
//         slug,
//         body.timing || null,
//         body.short_description || null,
//         body.about || null,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.website || null,
//         body.address || null,
//         body.city_id ? Number(body.city_id) : null,
//         body.area_id ? Number(body.area_id) : null,
//         body.status || "active",
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//         ...(imageUrl ? [imageUrl, newImageKey] : []),
//         id
//       ]
//     );

//     /* ------------------ NORMALIZE ------------------ */
//     const normalize = (v) => {
//       if (v === undefined) return undefined;
//       if (!v) return [];
//       if (Array.isArray(v)) return v.map(Number).filter(Boolean);
//       if (typeof v === "string")
//         return v.split(",").map(x => Number(x.trim())).filter(Boolean);
//       return [];
//     };

//     /* ------------------ SPECIALIZATIONS ------------------ */
//     const specializations = normalize(body.specializations);
//     if (specializations !== undefined) {
//       await pool.query(`DELETE FROM clinic_specialization WHERE clinic_id = ?`, [id]);

//       if (specializations.length) {
//         const values = specializations.map((sid, idx) => [
//           id,
//           sid,
//           idx === 0 ? 1 : 0
//         ]);

//         await pool.query(
//           `INSERT INTO clinic_specialization
//            (clinic_id, specialization_id, is_primary)
//            VALUES ?`,
//           [values]
//         );
//       }
//     }

//     /* ------------------ OTHER RELATIONS ------------------ */
//     const replaceRelations = async (table, col, values) => {
//       if (values === undefined) return;
//       await pool.query(`DELETE FROM ${table} WHERE clinic_id = ?`, [id]);
//       if (!values.length) return;
//       const rows = values.map(v => [id, v]);
//       await pool.query(
//         `INSERT INTO ${table} (clinic_id, ${col}) VALUES ?`,
//         [rows]
//       );
//     };

//     await replaceRelations("clinic_service", "service_id", normalize(body.services));
//     await replaceRelations("clinic_procedure", "procedure_id", normalize(body.procedures));
//     await replaceRelations("clinic_symptom", "symptom_id", normalize(body.symptoms));

//     /* ------------------ DOCTOR ↔ CLINIC ------------------ */
//     const doctors = normalize(body.doctors);
//     if (doctors !== undefined) {
//       await pool.query(`DELETE FROM doctor_clinic WHERE clinic_id = ?`, [id]);

//       if (doctors.length) {
//         const rows = doctors.map((did, idx) => [
//           did,
//           id,
//           idx === 0 ? 1 : 0,
//           body.consultation_fee || null,
//           null,
//           null
//         ]);

//         await pool.query(
//           `INSERT INTO doctor_clinic
//            (doctor_id, clinic_id, is_primary, consultation_fee, timings, practice_address)
//            VALUES ?`,
//           [rows]
//         );
//       }
//     }

//     /* ------------------ CLEAN OLD IMAGE ------------------ */
//     if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
//       await deleteFromS3(existing.image_key);
//     }

//     res.json({ ok: true, slug });

//   } catch (err) {
//     console.error("❌ updateClinic Error:", err);
//     if (newImageKey) await deleteFromS3(newImageKey);
//     res.status(500).json({ error: "Failed to update clinic" });
//   }
// };



export const updateClinic = async (req, res) => {
  const { id } = req.params;
  let newImageKey = null;

  try {
    /* ------------------ FETCH EXISTING ------------------ */
    const [[existing]] = await pool.query(
      `SELECT name, slug, image_key FROM clinics WHERE id = ?`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    const body = req.body || {};

    /* ------------------ SLUG (UNCHANGED) ------------------ */
    let slug = existing.slug;
    if (body.name && body.name !== existing.name) {
      const baseSlug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

      slug = baseSlug;
      let counter = 1;

      while (true) {
        const [[exists]] = await pool.query(
          `SELECT id FROM clinics WHERE slug = ? AND id != ? LIMIT 1`,
          [slug, id]
        );
        if (!exists) break;
        slug = `${baseSlug}-${counter++}`;
      }
    }

    /* ------------------ IMAGE ------------------ */
    let imageUrl = null;
    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "clinics");
      imageUrl = uploaded.imageUrl;
      newImageKey = uploaded.fileKey;
    }

    /* ------------------ UPDATE CLINIC ------------------ */
    await pool.query(
      `UPDATE clinics SET
        name = ?, slug = ?,
        timing = ?, short_description = ?, about = ?,
        phone_1 = ?, phone_2 = ?, website = ?, address = ?,
        city_id = ?, area_id = ?, status = ?,
        seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?,

        rating = ?, patients_count = ?, patients_stories = ?,
        is_profile_claimed = ?, show_call_button = ?, payment_type = ?
        ${imageUrl ? ", image_url = ?, image_key = ?" : ""}
       WHERE id = ?`,
      [
        body.name || existing.name,
        slug,
        body.timing || null,
        body.short_description || null,
        body.about || null,
        body.phone_1 || null,
        body.phone_2 || null,
        body.website || null,
        body.address || null,
        body.city_id ? Number(body.city_id) : null,
        body.area_id ? Number(body.area_id) : null,
        body.status || "active",
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,

        body.rating ? Number(body.rating) : 0,
        body.patients_count ? Number(body.patients_count) : 0,
        body.patients_stories ? Number(body.patients_stories) : 0,
        body.is_profile_claimed !== undefined
          ? Number(body.is_profile_claimed)
          : existing.is_profile_claimed,

        body.show_call_button !== undefined
          ? Number(body.show_call_button)
          : existing.show_call_button,

        body.payment_type ? Number(body.payment_type) : 0,

        ...(imageUrl ? [imageUrl, newImageKey] : []),
        id,
      ]
    );

    /* ------------------ NORMALIZE ------------------ */
    const normalize = (v) => {
      if (v === undefined) return undefined;
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(Number).filter(Boolean);
      return [];
    };

    /* ------------------ SPECIALIZATIONS ------------------ */
    const specializations = normalize(body.specializations);
    if (specializations !== undefined) {
      await pool.query(`DELETE FROM clinic_specialization WHERE clinic_id = ?`, [id]);

      if (specializations.length) {
        const placeholders = specializations.map(() => "(?, ?, ?)").join(",");
        const values = specializations.flatMap((sid, idx) => [
          id,
          sid,
          idx === 0 ? 1 : 0,
        ]);

        await pool.query(
          `INSERT INTO clinic_specialization
           (clinic_id, specialization_id, is_primary)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    /* ------------------ SERVICES ------------------ */
    const services = normalize(body.services);
    if (services !== undefined) {
      await pool.query(`DELETE FROM clinic_service WHERE clinic_id = ?`, [id]);

      if (services.length) {
        const placeholders = services.map(() => "(?, ?)").join(",");
        const values = services.flatMap((sid) => [id, sid]);

        await pool.query(
          `INSERT INTO clinic_service (clinic_id, service_id)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    /* ------------------ PROCEDURES ------------------ */
    const procedures = normalize(body.procedures);
    if (procedures !== undefined) {
      await pool.query(`DELETE FROM clinic_procedure WHERE clinic_id = ?`, [id]);

      if (procedures.length) {
        const placeholders = procedures.map(() => "(?, ?)").join(",");
        const values = procedures.flatMap((pid) => [id, pid]);

        await pool.query(
          `INSERT INTO clinic_procedure (clinic_id, procedure_id)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    /* ------------------ SYMPTOMS ------------------ */
    const symptoms = normalize(body.symptoms);
    if (symptoms !== undefined) {
      await pool.query(`DELETE FROM clinic_symptom WHERE clinic_id = ?`, [id]);

      if (symptoms.length) {
        const placeholders = symptoms.map(() => "(?, ?)").join(",");
        const values = symptoms.flatMap((sid) => [id, sid]);

        await pool.query(
          `INSERT INTO clinic_symptom (clinic_id, symptom_id)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    /* ------------------ DOCTOR ↔ CLINIC ------------------ */
    const doctors = normalize(body.doctors);
    if (doctors !== undefined) {
      await pool.query(`DELETE FROM doctor_clinic WHERE clinic_id = ?`, [id]);

      if (doctors.length) {
        const placeholders = doctors.map(() => "(?, ?, ?, ?, ?, ?)").join(",");
        const values = doctors.flatMap((did, idx) => [
          did,
          id,
          idx === 0 ? 1 : 0,
          body.consultation_fee || null,
          null,
          null,
        ]);

        await pool.query(
          `INSERT INTO doctor_clinic
           (doctor_id, clinic_id, is_primary, consultation_fee, timings, practice_address)
           VALUES ${placeholders}`,
          values
        );
      }
    }

    /* ------------------ CLEAN OLD IMAGE ------------------ */
    if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
      await deleteFromS3(existing.image_key);
    }

    res.json({ ok: true, slug });

  } catch (err) {
    console.error("❌ updateClinic Error:", err);
    if (newImageKey) await deleteFromS3(newImageKey);
    res.status(500).json({ error: "Failed to update clinic" });
  }
};




/**
 * DELETE /api/clinics/:id
 */
export const deleteClinic = async (req, res) => {
  const { id } = req.params;

  try {
    const [[clinic]] = await pool.query(
      `SELECT image_key FROM clinics WHERE id = ?`,
      [id]
    );

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    /* ------------------ DELETE RELATIONS (UNCHANGED) ------------------ */
    const tables = [
      "clinic_specialization",
      "clinic_service",
      "clinic_procedure",
      "clinic_symptom",
      "doctor_clinic"
    ];

    for (const t of tables) {
      await pool.query(`DELETE FROM ${t} WHERE clinic_id = ?`, [id]);
    }

    /* ------------------ SOFT DELETE CLINIC ------------------ */
    await pool.query(
      `UPDATE clinics SET
        status = 'inactive',
        deleted_at = NOW(),
        deleted_by = ?
       WHERE id = ?`,
      [req.user?.id || "admin", id]
    );

    /* ------------------ OPTIONAL IMAGE CLEANUP ------------------ */
    if (clinic.image_key) {
      await deleteFromS3(clinic.image_key);
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ deleteClinic Error:", err);
    res.status(500).json({ error: "Failed to delete clinic" });
  }
};

