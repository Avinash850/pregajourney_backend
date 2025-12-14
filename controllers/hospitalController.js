import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/**
 * GET /api/hospitals
 * Lightweight list + mapping IDs for quick edit prefilling
 */
export const getHospitals = async (req, res) => {
  try {
    const [hospitals] = await pool.query(
      `SELECT * FROM hospitals ORDER BY id DESC`
    );

    if (!hospitals || hospitals.length === 0) {
      return res.json([]);
    }

    const ids = hospitals.map(h => h.id);

    // ---------- FIXED QUERIES ----------
    const specializations = await pool
      .query(
        `SELECT hospital_id, specialization_id AS id 
         FROM hospital_specialization 
         WHERE hospital_id IN (?)`,
        [ids]
      )
      .then(r => r[0] || [])
      .catch(() => []);

    const clinics = await pool
      .query(
        `SELECT hospital_id, clinic_id AS id 
         FROM hospital_clinic 
         WHERE hospital_id IN (?)`,
        [ids]
      )
      .then(r => r[0] || [])
      .catch(() => []);

    const services = await pool
      .query(
        `SELECT hospital_id, service_id AS id 
         FROM hospital_service 
         WHERE hospital_id IN (?)`,
        [ids]
      )
      .then(r => r[0] || [])
      .catch(() => []);

    const procedures = await pool
      .query(
        `SELECT hospital_id, procedure_id AS id 
         FROM hospital_procedure 
         WHERE hospital_id IN (?)`,
        [ids]
      )
      .then(r => r[0] || [])
      .catch(() => []);

    const symptoms = await pool
      .query(
        `SELECT hospital_id, symptom_id AS id 
         FROM hospital_symptom 
         WHERE hospital_id IN (?)`,
        [ids]
      )
      .then(r => r[0] || [])
      .catch(() => []);


    // ---------- BUILD FINAL RESPONSE ----------
    const response = hospitals.map(h => ({
      ...h,
      specializations: specializations
        .filter(x => x.hospital_id === h.id)
        .map(x => x.id),

      services: services
        .filter(x => x.hospital_id === h.id)
        .map(x => x.id),

      procedures: procedures
        .filter(x => x.hospital_id === h.id)
        .map(x => x.id),

      symptoms: symptoms
        .filter(x => x.hospital_id === h.id)
        .map(x => x.id),

      clinics: clinics
        .filter(x => x.hospital_id === h.id)
        .map(x => x.id),
    }));

    res.json(response);

  } catch (err) {
    console.error("❌ getHospitals Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


export const getHospitalById = async (req, res) => {
  const { id } = req.params;

  try {
    const [[hospital]] = await pool.query(
      `SELECT * FROM hospitals WHERE id = ?`,
      [id]
    );

    if (!hospital) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    // return both id + name (for dropdowns)
    const [specializations] = await pool.query(
      `SELECT hs.specialization_id AS id, s.name
       FROM hospital_specialization hs
       JOIN specializations s ON s.id = hs.specialization_id
       WHERE hs.hospital_id = ?`,
      [id]
    );

    const [services] = await pool.query(
      `SELECT hs.service_id AS id, s.name
       FROM hospital_service hs
       JOIN services s ON s.id = hs.service_id
       WHERE hs.hospital_id = ?`,
      [id]
    );

    const [procedures] = await pool.query(
      `SELECT hp.procedure_id AS id, p.name
       FROM hospital_procedure hp
       JOIN procedures p ON p.id = hp.procedure_id
       WHERE hp.hospital_id = ?`,
      [id]
    );

    const [symptoms] = await pool.query(
      `SELECT hs.symptom_id AS id, s.name
       FROM hospital_symptom hs
       JOIN symptoms s ON s.id = hs.symptom_id
       WHERE hs.hospital_id = ?`,
      [id]
    );

    // city & area
    let city = null;
    let area = null;

    if (hospital.city_id) {
      const [crow] = await pool.query(
        `SELECT id, name FROM cities WHERE id = ?`,
        [hospital.city_id]
      );
      city = crow?.[0] ?? null;
    }

    if (hospital.area_id) {
      const [arow] = await pool.query(
        `SELECT id, name FROM areas WHERE id = ?`,
        [hospital.area_id]
      );
      area = arow?.[0] ?? null;
    }

    res.json({
      ...hospital,
      specializations, // <-- ARRAY OF OBJECTS WITH id + name
      services,        // <-- FIXED
      procedures,      // <-- FIXED
      symptoms,        // <-- FIXED
      city,
      area,
    });

  } catch (err) {
    console.error("❌ getHospitalById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/**
 * POST /api/hospitals
 * Create hospital with mappings and S3 upload (folder: hospitals)
 */
export const createHospital = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // upload image if present
      const file = req.file;
      let imageUrl = null;
      let imageKey = null;
      if (file) {
        const uploaded = await uploadImageToS3(file, "hospitals");
        imageUrl = uploaded.imageUrl;
        imageKey = uploaded.fileKey;
      }

      const body = req.body || {};
      const normalizeArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(Number).filter(Boolean);
        if (typeof v === "string") {
          if (!v) return [];
          return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        }
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const services = normalizeArray(body.services);
      const procedures = normalizeArray(body.procedures);
      const symptoms = normalizeArray(body.symptoms);

      const insertSql = `INSERT INTO hospitals
        (name, slug, timing, short_description, about, image_url, image_key, phone_1, phone_2, website, address, city_id, area_id, status, seo_title, seo_keywords, seo_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      const params = [
        body.name || "",
        body.slug || null,
        body.timing || null,
        body.short_description || null,
        body.about || null,
        imageUrl || null,
        imageKey || null,
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
      ];

      const [result] = await connection.query(insertSql, params);
      const hospitalId = result.insertId;

      const insertMany = async (table, col, ids) => {
        if (!ids || ids.length === 0) return;
        const values = ids.map((x) => [hospitalId, x]);
        const ins = `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`;
        await connection.query(ins, [values]);
      };

      await insertMany("hospital_specialization", "specialization_id", specializations);
      await insertMany("hospital_service", "service_id", services);
      await insertMany("hospital_procedure", "procedure_id", procedures);
      await insertMany("hospital_symptom", "symptom_id", symptoms);

      await connection.commit();
      res.status(201).json({ id: hospitalId });
    } catch (err) {
      await connection.rollback();
      console.error("❌ createHospital Error:", err);
      res.status(500).json({ error: "Failed to create hospital" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ createHospital Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * PUT /api/hospitals/:id
 * Update hospital; upload new image, update image_url & image_key and delete old file after commit
 */
export const updateHospital = async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[existing]] = await connection.query(`SELECT id, image_key FROM hospitals WHERE id = ?`, [id]);
      if (!existing) {
        await connection.rollback();
        return res.status(404).json({ error: "Hospital not found" });
      }
      const oldKey = existing.image_key;

      // upload new if provided
      let newImageUrl = null;
      let newImageKey = null;
      if (req.file) {
        const up = await uploadImageToS3(req.file, "hospitals");
        newImageUrl = up.imageUrl;
        newImageKey = up.fileKey;
      }

      const body = req.body || {};
      const normalizeArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(Number).filter(Boolean);
        if (typeof v === "string") return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const services = normalizeArray(body.services);
      const procedures = normalizeArray(body.procedures);
      const symptoms = normalizeArray(body.symptoms);

      const updateSql = `
        UPDATE hospitals SET
          name = ?, slug = ?, timing = ?, short_description = ?, about = ?, phone_1 = ?, phone_2 = ?, website = ?, address = ?, city_id = ?, area_id = ?, status = ?, seo_title = ?, seo_keywords = ?, seo_description = ?
          ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
        WHERE id = ?
      `;

      const baseParams = [
        body.name || "",
        body.slug || null,
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
      ];

      const updateParams = newImageUrl ? [...baseParams, newImageUrl, newImageKey, id] : [...baseParams, id];
      await connection.query(updateSql, updateParams);

      // delete + re-insert mapping tables
      const deleteAndInsert = async (delSql, table, col, ids) => {
        await connection.query(delSql, [id]);
        if (!ids || ids.length === 0) return;
        const values = ids.map((x) => [id, x]);
        const insSql = `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`;
        await connection.query(insSql, [values]);
      };

      await deleteAndInsert(`DELETE FROM hospital_specialization WHERE hospital_id = ?`, "hospital_specialization", "specialization_id", specializations);
      await deleteAndInsert(`DELETE FROM hospital_service WHERE hospital_id = ?`, "hospital_service", "service_id", services);
      await deleteAndInsert(`DELETE FROM hospital_procedure WHERE hospital_id = ?`, "hospital_procedure", "procedure_id", procedures);
      await deleteAndInsert(`DELETE FROM hospital_symptom WHERE hospital_id = ?`, "hospital_symptom", "symptom_id", symptoms);

      await connection.commit();

      // delete old image from s3 after commit
      if (newImageKey && oldKey && oldKey !== newImageKey) {
        await deleteFromS3(oldKey);
      }

      res.json({ ok: true });
    } catch (err) {
      await connection.rollback();
      console.error("❌ updateHospital Error:", err);
      res.status(500).json({ error: "Failed to update hospital" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ updateHospital Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/**
 * DELETE /api/hospitals/:id
 */
export const deleteHospital = async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // fetch image_key first
      const [[hospital]] = await connection.query(`SELECT image_key FROM hospitals WHERE id = ?`, [id]);
      if (!hospital) {
        await connection.rollback();
        return res.status(404).json({ error: "Hospital not found" });
      }
      const imageKey = hospital.image_key;

      // delete mapping rows
      await connection.query(`DELETE FROM hospital_specialization WHERE hospital_id = ?`, [id]);
      await connection.query(`DELETE FROM hospital_service WHERE hospital_id = ?`, [id]);
      await connection.query(`DELETE FROM hospital_procedure WHERE hospital_id = ?`, [id]);
      await connection.query(`DELETE FROM hospital_symptom WHERE hospital_id = ?`, [id]);

      // delete hospital
      await connection.query(`DELETE FROM hospitals WHERE id = ?`, [id]);

      await connection.commit();

      // delete s3 object afterwards
      if (imageKey) {
        await deleteFromS3(imageKey);
      }

      res.json({ ok: true });
    } catch (err) {
      await connection.rollback();
      console.error("❌ deleteHospital Error:", err);
      res.status(500).json({ error: "Failed to delete hospital" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ deleteHospital Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
