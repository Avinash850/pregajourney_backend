import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/**
 * GET /api/clinics
 * Lightweight list + mapping IDs
 */
export const getClinics = async (req, res) => {
  try {
    const [clinics] = await pool.query(
      `SELECT * FROM clinics ORDER BY id DESC`
    );

    if (!clinics || clinics.length === 0) {
      return res.json([]);
    }

    const ids = clinics.map(c => c.id);

    const specializations = await pool
      .query(
        `SELECT clinic_id, specialization_id AS id
         FROM clinic_specialization
         WHERE clinic_id IN (?)`,
        [ids]
      ).then(r => r[0] || []);

    const services = await pool
      .query(
        `SELECT clinic_id, service_id AS id
         FROM clinic_service
         WHERE clinic_id IN (?)`,
        [ids]
      ).then(r => r[0] || []);

    const procedures = await pool
      .query(
        `SELECT clinic_id, procedure_id AS id
         FROM clinic_procedure
         WHERE clinic_id IN (?)`,
        [ids]
      ).then(r => r[0] || []);

    const symptoms = await pool
      .query(
        `SELECT clinic_id, symptom_id AS id
         FROM clinic_symptom
         WHERE clinic_id IN (?)`,
        [ids]
      ).then(r => r[0] || []);

    const doctors = await pool
      .query(
        `SELECT clinic_id, doctor_id AS id
         FROM doctor_clinic
         WHERE clinic_id IN (?)`,
        [ids]
      ).then(r => r[0] || []);

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
    const [[clinic]] = await pool.query(
      `SELECT * FROM clinics WHERE id = ?`,
      [id]
    );

    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found" });
    }

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





/**
 * POST /api/clinics
 * Practo-style clinic creation (slug auto-generated)
 */
export const createClinic = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // -----------------------------
    // Image upload
    // -----------------------------
    let imageUrl = null;
    let imageKey = null;

    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "clinics");
      imageUrl = uploaded.imageUrl;
      imageKey = uploaded.fileKey;
    }

    const body = req.body || {};

    // -----------------------------
    // Slug generation (AUTO)
    // -----------------------------
    const baseSlug = body.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    let slug = baseSlug;
    let counter = 1;

    while (true) {
      const [[exists]] = await connection.query(
        `SELECT id FROM clinics WHERE slug = ? LIMIT 1`,
        [slug]
      );
      if (!exists) break;
      slug = `${baseSlug}-${counter++}`;
    }

    // -----------------------------
    // Normalize arrays
    // -----------------------------
    const normalize = (v) =>
      !v
        ? []
        : Array.isArray(v)
        ? v.map(Number).filter(Boolean)
        : v.split(",").map(x => Number(x.trim())).filter(Boolean);

    const specializations = normalize(body.specializations);
    const services = normalize(body.services);
    const procedures = normalize(body.procedures);
    const symptoms = normalize(body.symptoms);
    const doctors = normalize(body.doctors);

    // -----------------------------
    // Insert clinic
    // -----------------------------
    const [result] = await connection.query(
      `
      INSERT INTO clinics
      (name, slug, timing, short_description, about,
       image_url, image_key,
       phone_1, phone_2, website, address,
       city_id, area_id, status,
       seo_title, seo_keywords, seo_description, json_schema)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
      ]
    );

    const clinicId = result.insertId;

    // -----------------------------
    // Mapping tables
    // -----------------------------
    const insertMany = async (table, col, ids) => {
      if (!ids.length) return;
      await connection.query(
        `INSERT INTO ${table} (clinic_id, ${col}) VALUES ?`,
        [ids.map(x => [clinicId, x])]
      );
    };

    await insertMany("clinic_specialization", "specialization_id", specializations);
    await insertMany("clinic_service", "service_id", services);
    await insertMany("clinic_procedure", "procedure_id", procedures);
    await insertMany("clinic_symptom", "symptom_id", symptoms);
    await insertMany("doctor_clinic", "doctor_id", doctors);

    await connection.commit();

    res.status(201).json({
      id: clinicId,
      slug
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ createClinic Error:", err);
    res.status(500).json({ error: "Failed to create clinic" });
  } finally {
    connection.release();
  }
};


/**
 * PUT /api/clinics/:id
 * Practo-style clinic update (slug regenerates only if name changes)
 */
export const updateClinic = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [[existing]] = await connection.query(
      `SELECT name, image_key FROM clinics WHERE id = ?`,
      [id]
    );

    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: "Clinic not found" });
    }

    // -----------------------------
    // Image upload
    // -----------------------------
    let newImageUrl = null;
    let newImageKey = null;

    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "clinics");
      newImageUrl = uploaded.imageUrl;
      newImageKey = uploaded.fileKey;
    }

    const body = req.body || {};

    // -----------------------------
    // Slug regeneration (only if name changed)
    // -----------------------------
    let slug = null;

    if (body.name && body.name !== existing.name) {
      const baseSlug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-");

      slug = baseSlug;
      let counter = 1;

      while (true) {
        const [[exists]] = await connection.query(
          `SELECT id FROM clinics WHERE slug = ? AND id != ? LIMIT 1`,
          [slug, id]
        );
        if (!exists) break;
        slug = `${baseSlug}-${counter++}`;
      }
    }

    // -----------------------------
    // Normalize arrays
    // -----------------------------
    const normalize = (v) =>
      !v
        ? []
        : Array.isArray(v)
        ? v.map(Number).filter(Boolean)
        : v.split(",").map(x => Number(x.trim())).filter(Boolean);

    const specializations = normalize(body.specializations);
    const services = normalize(body.services);
    const procedures = normalize(body.procedures);
    const symptoms = normalize(body.symptoms);
    const doctors = normalize(body.doctors);

    // -----------------------------
    // Update clinic
    // -----------------------------
    await connection.query(
      `
      UPDATE clinics SET
        name = ?,
        ${slug ? "slug = ?," : ""}
        timing = ?, short_description = ?, about = ?,
        phone_1 = ?, phone_2 = ?, website = ?, address = ?,
        city_id = ?, area_id = ?, status = ?,
        seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?
        ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
      WHERE id = ?
      `,
      [
        body.name || existing.name,
        ...(slug ? [slug] : []),
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
        ...(newImageUrl ? [newImageUrl, newImageKey] : []),
        id
      ]
    );

    // -----------------------------
    // Reset mappings
    // -----------------------------
    const reset = (table) =>
      connection.query(`DELETE FROM ${table} WHERE clinic_id = ?`, [id]);

    await reset("clinic_specialization");
    await reset("clinic_service");
    await reset("clinic_procedure");
    await reset("clinic_symptom");
    await reset("doctor_clinic");

    const insertMany = async (table, col, ids) => {
      if (!ids.length) return;
      await connection.query(
        `INSERT INTO ${table} (clinic_id, ${col}) VALUES ?`,
        [ids.map(x => [id, x])]
      );
    };

    await insertMany("clinic_specialization", "specialization_id", specializations);
    await insertMany("clinic_service", "service_id", services);
    await insertMany("clinic_procedure", "procedure_id", procedures);
    await insertMany("clinic_symptom", "symptom_id", symptoms);
    await insertMany("doctor_clinic", "doctor_id", doctors);

    await connection.commit();

    if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
      await deleteFromS3(existing.image_key);
    }

    res.json({
      ok: true,
      slug: slug || undefined
    });

  } catch (err) {
    await connection.rollback();
    console.error("❌ updateClinic Error:", err);
    res.status(500).json({ error: "Failed to update clinic" });
  } finally {
    connection.release();
  }
};



/**
 * DELETE /api/clinics/:id
 */
export const deleteClinic = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1️⃣ Fetch image_key first
      const [[clinic]] = await connection.query(
        `SELECT image_key FROM clinics WHERE id = ?`,
        [id]
      );

      if (!clinic) {
        await connection.rollback();
        return res.status(404).json({ error: "Clinic not found" });
      }

      const imageKey = clinic.image_key;

      // 2️⃣ Delete relation tables
      await connection.query(
        `DELETE FROM clinic_specialization WHERE clinic_id = ?`,
        [id]
      );

      await connection.query(
        `DELETE FROM clinic_service WHERE clinic_id = ?`,
        [id]
      );

      await connection.query(
        `DELETE FROM clinic_procedure WHERE clinic_id = ?`,
        [id]
      );

      await connection.query(
        `DELETE FROM clinic_symptom WHERE clinic_id = ?`,
        [id]
      );

      // doctor ↔ clinic mapping
      await connection.query(
        `DELETE FROM doctor_clinic WHERE clinic_id = ?`,
        [id]
      );

      // 3️⃣ Delete clinic itself
      await connection.query(
        `DELETE FROM clinics WHERE id = ?`,
        [id]
      );

      await connection.commit();

      // 4️⃣ Delete image from S3 AFTER commit
      if (imageKey) {
        await deleteFromS3(imageKey);
      }

      res.json({ ok: true });

    } catch (err) {
      await connection.rollback();
      console.error("❌ deleteClinic Error:", err);
      res.status(500).json({ error: "Failed to delete clinic" });
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("❌ deleteClinic Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
