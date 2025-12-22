import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/* =====================================================
   GET /api/hospitals
   Lightweight list + mapping IDs
   ===================================================== */
export const getHospitals = async (req, res) => {
  try {
    const [hospitals] = await pool.query(`SELECT * FROM hospitals ORDER BY id DESC`);
    if (!hospitals || hospitals.length === 0) return res.json([]);

    const ids = hospitals.map(h => h.id);

    const [specializations] = await pool.query(
      `SELECT hospital_id, specialization_id AS id FROM hospital_specialization WHERE hospital_id IN (?)`, [ids]
    );
    // const [clinics] = await pool.query(
    //   `SELECT hospital_id, clinic_id AS id FROM hospital_clinic WHERE hospital_id IN (?)`, [ids]
    // );
    const [services] = await pool.query(
      `SELECT hospital_id, service_id AS id FROM hospital_service WHERE hospital_id IN (?)`, [ids]
    );
    const [procedures] = await pool.query(
      `SELECT hospital_id, procedure_id AS id FROM hospital_procedure WHERE hospital_id IN (?)`, [ids]
    );
    const [symptoms] = await pool.query(
      `SELECT hospital_id, symptom_id AS id FROM hospital_symptom WHERE hospital_id IN (?)`, [ids]
    );

    const response = hospitals.map(h => ({
      ...h,
      specializations: specializations.filter(x => x.hospital_id === h.id).map(x => x.id),
      // clinics: clinics.filter(x => x.hospital_id === h.id).map(x => x.id),
      services: services.filter(x => x.hospital_id === h.id).map(x => x.id),
      procedures: procedures.filter(x => x.hospital_id === h.id).map(x => x.id),
      symptoms: symptoms.filter(x => x.hospital_id === h.id).map(x => x.id),
    }));

    res.json(response);

  } catch (err) {
    console.error("❌ getHospitals Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/* =====================================================
   GET /api/hospitals/:id
   Full hospital details + relations
   ===================================================== */
export const getHospitalById = async (req, res) => {
  const { id } = req.params;
  try {
    const [[hospital]] = await pool.query(`SELECT * FROM hospitals WHERE id = ?`, [id]);
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });

    const [specializations] = await pool.query(
      `SELECT hs.specialization_id AS id, s.name
       FROM hospital_specialization hs
       JOIN specializations s ON s.id = hs.specialization_id
       WHERE hs.hospital_id = ?`, [id]
    );

    const [services] = await pool.query(
      `SELECT hs.service_id AS id, s.name
       FROM hospital_service hs
       JOIN services s ON s.id = hs.service_id
       WHERE hs.hospital_id = ?`, [id]
    );

    const [procedures] = await pool.query(
      `SELECT hp.procedure_id AS id, p.name
       FROM hospital_procedure hp
       JOIN procedures p ON p.id = hp.procedure_id
       WHERE hp.hospital_id = ?`, [id]
    );

    const [symptoms] = await pool.query(
      `SELECT hs.symptom_id AS id, s.name
       FROM hospital_symptom hs
       JOIN symptoms s ON s.id = hs.symptom_id
       WHERE hs.hospital_id = ?`, [id]
    );

    let city = null, area = null;
    if (hospital.city_id) {
      const [crow] = await pool.query(`SELECT id, name FROM cities WHERE id = ?`, [hospital.city_id]);
      city = crow?.[0] ?? null;
    }
    if (hospital.area_id) {
      const [arow] = await pool.query(`SELECT id, name FROM areas WHERE id = ?`, [hospital.area_id]);
      area = arow?.[0] ?? null;
    }

    res.json({
      ...hospital,
      specializations,
      services,
      procedures,
      symptoms,
      city,
      area,
    });

  } catch (err) {
    console.error("❌ getHospitalById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/* =====================================================
   SLUG HELPERS
   ===================================================== */
const makeSlug = (text) => text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const getUniqueHospitalSlug = async (baseSlug, excludeId = null) => {
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const sql = excludeId
      ? `SELECT id FROM hospitals WHERE slug = ? AND id != ? LIMIT 1`
      : `SELECT id FROM hospitals WHERE slug = ? LIMIT 1`;

    const params = excludeId ? [slug, excludeId] : [slug];
    const [[row]] = await pool.query(sql, params);
    if (!row) return slug;
    slug = `${baseSlug}-${counter++}`;
  }
};

/* =====================================================
   CREATE HOSPITAL
   ===================================================== */
export const createHospital = async (req, res) => {
  let imageKey = null;

  try {
    let imageUrl = null;

    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "hospitals");
      imageUrl = uploaded.imageUrl;
      imageKey = uploaded.fileKey;
    }

    const body = req.body || {};
    const baseSlug = makeSlug(body.name || "");
    const slug = await getUniqueHospitalSlug(baseSlug);

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

    /* ------------------ INSERT HOSPITAL ------------------ */
    const [result] = await pool.query(
      `INSERT INTO hospitals
       (name, slug, timing, short_description, about, image_url, image_key,
        phone_1, phone_2, website, address, city_id, area_id, status,
        seo_title, seo_keywords, seo_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      ]
    );

    const hospitalId = result.insertId;

    /* ------------------ SPECIALIZATIONS ------------------ */
    if (specializations.length) {
      const values = specializations.map((sid, idx) => [
        hospitalId,
        sid,
        idx === 0 ? 1 : 0, // primary
      ]);

      await pool.query(
        `INSERT INTO hospital_specialization
         (hospital_id, specialization_id, is_primary)
         VALUES ?`,
        [values]
      );
    }

    /* ------------------ OTHER RELATIONS ------------------ */
    const insertMany = async (table, col, ids) => {
      if (!ids.length) return;
      const values = ids.map(x => [hospitalId, x]);
      await pool.query(
        `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`,
        [values]
      );
    };

    await insertMany("hospital_service", "service_id", services);
    await insertMany("hospital_procedure", "procedure_id", procedures);
    await insertMany("hospital_symptom", "symptom_id", symptoms);

    res.status(201).json({ id: hospitalId, slug });

  } catch (err) {
    console.error("❌ createHospital Error:", err);
    if (imageKey) await deleteFromS3(imageKey);
    res.status(500).json({ error: "Failed to create hospital" });
  }
};

/* =====================================================
   UPDATE HOSPITAL
   ===================================================== */
export const updateHospital = async (req, res) => {
  const { id } = req.params;
  let newImageKey = null;

  try {
    const [[existing]] = await pool.query(
      `SELECT id, name, slug, image_key FROM hospitals WHERE id = ?`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({ error: "Hospital not found" });
    }

    const body = req.body || {};

    /* ------------------ SLUG ------------------ */
    let slug = existing.slug;
    if (body.name && body.name !== existing.name) {
      slug = await getUniqueHospitalSlug(makeSlug(body.name), id);
    }

    /* ------------------ IMAGE ------------------ */
    let imageUrl = null;
    if (req.file) {
      const up = await uploadImageToS3(req.file, "hospitals");
      imageUrl = up.imageUrl;
      newImageKey = up.fileKey;
    }

    /* ------------------ UPDATE HOSPITAL ------------------ */
    const updateSql = `
      UPDATE hospitals SET
        name = ?,
        slug = ?,
        timing = ?, short_description = ?, about = ?,
        phone_1 = ?, phone_2 = ?, website = ?, address = ?,
        city_id = ?, area_id = ?, status = ?,
        seo_title = ?, seo_keywords = ?, seo_description = ?
        ${imageUrl ? ", image_url = ?, image_key = ?" : ""}
      WHERE id = ?
    `;

    const params = [
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
      ...(imageUrl ? [imageUrl, newImageKey] : []),
      id
    ];

    await pool.query(updateSql, params);

    /* ------------------ NORMALIZE ------------------ */
    const normalizeArray = (v) => {
      if (v === undefined) return undefined;
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string")
        return v.split(",").map(x => Number(x.trim())).filter(Boolean);
      return [];
    };

    /* ------------------ SPECIALIZATIONS ------------------ */
    const specializations = normalizeArray(body.specializations);
    if (specializations !== undefined) {
      await pool.query(`DELETE FROM hospital_specialization WHERE hospital_id = ?`, [id]);

      if (specializations.length) {
        const values = specializations.map((sid, idx) => [
          id,
          sid,
          idx === 0 ? 1 : 0
        ]);

        await pool.query(
          `INSERT INTO hospital_specialization
           (hospital_id, specialization_id, is_primary)
           VALUES ?`,
          [values]
        );
      }
    }

    /* ------------------ OTHER RELATIONS ------------------ */
    const replaceRelations = async (table, col, values) => {
      if (values === undefined) return;
      await pool.query(`DELETE FROM ${table} WHERE hospital_id = ?`, [id]);
      if (!values.length) return;
      const rows = values.map(v => [id, v]);
      await pool.query(
        `INSERT INTO ${table} (hospital_id, ${col}) VALUES ?`,
        [rows]
      );
    };

    await replaceRelations("hospital_service", "service_id", normalizeArray(body.services));
    await replaceRelations("hospital_procedure", "procedure_id", normalizeArray(body.procedures));
    await replaceRelations("hospital_symptom", "symptom_id", normalizeArray(body.symptoms));

    /* ------------------ CLEAN OLD IMAGE ------------------ */
    if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
      await deleteFromS3(existing.image_key);
    }

    res.json({ ok: true, slug });

  } catch (err) {
    console.error("❌ updateHospital Error:", err);
    if (newImageKey) await deleteFromS3(newImageKey);
    res.status(500).json({ error: "Failed to update hospital" });
  }
};


/* =====================================================
   DELETE HOSPITAL
   ===================================================== */
export const deleteHospital = async (req, res) => {
  const { id } = req.params;
  try {
    const [[hospital]] = await pool.query(`SELECT image_key FROM hospitals WHERE id = ?`, [id]);
    if (!hospital) return res.status(404).json({ error: "Hospital not found" });

    const imageKey = hospital.image_key;

    const tables = ["hospital_specialization", "hospital_service", "hospital_procedure", "hospital_symptom"];
    for (const t of tables) {
      await pool.query(`DELETE FROM ${t} WHERE hospital_id = ?`, [id]);
    }

    await pool.query(`DELETE FROM hospitals WHERE id = ?`, [id]);

    if (imageKey) await deleteFromS3(imageKey);

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ deleteHospital Error:", err);
    res.status(500).json({ error: "Failed to delete hospital" });
  }
};
