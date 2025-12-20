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



/* =====================================================
   SLUG HELPERS (INLINE – NO EXTERNAL FILES)
   ===================================================== */
const makeSlug = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const getUniqueHospitalSlug = async (connection, baseSlug, excludeId = null) => {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const sql = excludeId
      ? `SELECT id FROM hospitals WHERE slug = ? AND id != ? LIMIT 1`
      : `SELECT id FROM hospitals WHERE slug = ? LIMIT 1`;

    const params = excludeId ? [slug, excludeId] : [slug];
    const [[row]] = await connection.query(sql, params);

    if (!row) return slug;
    slug = `${baseSlug}-${counter++}`;
  }
};

/* =====================================================
   CREATE HOSPITAL (AUTO SLUG – PRACTO STYLE)
   ===================================================== */
export const createHospital = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      /* ---------- IMAGE ---------- */
      let imageUrl = null;
      let imageKey = null;

      if (req.file) {
        const uploaded = await uploadImageToS3(req.file, "hospitals");
        imageUrl = uploaded.imageUrl;
        imageKey = uploaded.fileKey;
      }

      const body = req.body || {};

      /* ---------- AUTO SLUG ---------- */
      const baseSlug = makeSlug(body.name || "");
      const slug = await getUniqueHospitalSlug(connection, baseSlug);

      /* ---------- ARRAY NORMALIZER ---------- */
      const normalizeArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(Number).filter(Boolean);
        if (typeof v === "string")
          return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const services = normalizeArray(body.services);
      const procedures = normalizeArray(body.procedures);
      const symptoms = normalizeArray(body.symptoms);

      /* ---------- INSERT HOSPITAL ---------- */
      const insertSql = `
        INSERT INTO hospitals
        (name, slug, timing, short_description, about, image_url, image_key,
         phone_1, phone_2, website, address, city_id, area_id, status,
         seo_title, seo_keywords, seo_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
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
      ];

      const [result] = await connection.query(insertSql, params);
      const hospitalId = result.insertId;

      /* ---------- MAPPING TABLES ---------- */
      const insertMany = async (table, col, ids) => {
        if (!ids.length) return;
        const values = ids.map((x) => [hospitalId, x]);
        await connection.query(
          `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`,
          [values]
        );
      };

      await insertMany("hospital_specialization", "specialization_id", specializations);
      await insertMany("hospital_service", "service_id", services);
      await insertMany("hospital_procedure", "procedure_id", procedures);
      await insertMany("hospital_symptom", "symptom_id", symptoms);

      await connection.commit();

      res.status(201).json({
        id: hospitalId,
        slug,
      });

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

/* =====================================================
   UPDATE HOSPITAL (REGENERATE SLUG IF NAME CHANGES)
   ===================================================== */
export const updateHospital = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[existing]] = await connection.query(
        `SELECT id, name, image_key FROM hospitals WHERE id = ?`,
        [id]
      );

      if (!existing) {
        await connection.rollback();
        return res.status(404).json({ error: "Hospital not found" });
      }

      /* ---------- SLUG UPDATE ---------- */
      let newSlug = null;
      if (req.body?.name && req.body.name !== existing.name) {
        const baseSlug = makeSlug(req.body.name);
        newSlug = await getUniqueHospitalSlug(connection, baseSlug, id);
      }

      /* ---------- IMAGE UPDATE ---------- */
      let newImageUrl = null;
      let newImageKey = null;

      if (req.file) {
        const up = await uploadImageToS3(req.file, "hospitals");
        newImageUrl = up.imageUrl;
        newImageKey = up.fileKey;
      }

      const body = req.body || {};

      /* ---------- UPDATE QUERY ---------- */
      const updateSql = `
        UPDATE hospitals SET
          name = ?,
          ${newSlug ? "slug = ?," : ""}
          timing = ?, short_description = ?, about = ?,
          phone_1 = ?, phone_2 = ?, website = ?, address = ?,
          city_id = ?, area_id = ?, status = ?,
          seo_title = ?, seo_keywords = ?, seo_description = ?
          ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
        WHERE id = ?
      `;

      const params = [
        body.name || existing.name,
        ...(newSlug ? [newSlug] : []),
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
        ...(newImageUrl ? [newImageUrl, newImageKey] : []),
        id,
      ];

      await connection.query(updateSql, params);

      /* ---------- MAPPING TABLES ---------- */
      const normalizeArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(Number).filter(Boolean);
        if (typeof v === "string")
          return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const services = normalizeArray(body.services);
      const procedures = normalizeArray(body.procedures);
      const symptoms = normalizeArray(body.symptoms);

      const deleteAndInsert = async (table, col, ids) => {
        await connection.query(`DELETE FROM ${table} WHERE hospital_id = ?`, [id]);
        if (!ids.length) return;
        const values = ids.map((x) => [id, x]);
        await connection.query(
          `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`,
          [values]
        );
      };

      await deleteAndInsert("hospital_specialization", "specialization_id", specializations);
      await deleteAndInsert("hospital_service", "service_id", services);
      await deleteAndInsert("hospital_procedure", "procedure_id", procedures);
      await deleteAndInsert("hospital_symptom", "symptom_id", symptoms);

      await connection.commit();

      if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
        await deleteFromS3(existing.image_key);
      }

      res.json({
        ok: true,
        slug: newSlug || undefined,
      });

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
