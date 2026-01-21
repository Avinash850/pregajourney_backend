import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/* =====================================================
   HELPER: Slugify & Generate Unique Doctor Slug
   ===================================================== */
const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const generateUniqueDoctorSlug = async (doctorName, specializationName, excludeDoctorId = null) => {
  let base = `dr-${doctorName}`;
  if (specializationName) base += `-${specializationName}`;
  base = slugify(base);

  let slug = base;
  let counter = 1;

  while (true) {
    const sql = excludeDoctorId
      ? `SELECT id FROM doctors WHERE slug = ? AND id != ? LIMIT 1`
      : `SELECT id FROM doctors WHERE slug = ? LIMIT 1`;
    const params = excludeDoctorId ? [slug, excludeDoctorId] : [slug];
    const [[exists]] = await pool.query(sql, params);

    if (!exists) break;
    slug = `${base}-${counter++}`;
  }

  return slug;
};

/* =====================================================
   GET DOCTORS (with mapping IDs)
   ===================================================== */
export const getDoctors = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;

    /* ------------------ BUILD WHERE ------------------ */
    const where = [];
    const params = [];

    if (from_date) {
      where.push("created_at >= ?");
      params.push(`${from_date} 00:00:00`);
    }

    if (to_date) {
      where.push("created_at <= ?");
      params.push(`${to_date} 23:59:59`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    /* ------------------ FETCH DOCTORS ------------------ */
    const [doctors] = await pool.query(
      `
      SELECT
       *
      FROM doctors
      ${whereSql}
      ORDER BY created_at DESC
      `,
      params
    );

    if (!doctors.length) return res.json([]);

    const doctorIds = doctors.map(d => d.id);

    /* ------------------ FETCH RELATIONS ------------------ */
    const fetchRelation = (table, col) =>
      pool.query(
        `SELECT doctor_id, ${col} AS id FROM ${table} WHERE doctor_id IN (?)`,
        [doctorIds]
      );

    const [
      [specializations],
      [clinics],
      [hospitals],
      [procedures],
      [services],
      [symptoms],
    ] = await Promise.all([
      fetchRelation("doctor_specialization", "specialization_id"),
      fetchRelation("doctor_clinic", "clinic_id"),
      fetchRelation("doctor_hospital", "hospital_id"),
      fetchRelation("doctor_procedure", "procedure_id"),
      fetchRelation("doctor_service", "service_id"),
      fetchRelation("doctor_symptom", "symptom_id"),
    ]);

    /* ------------------ MAP RESPONSE ------------------ */
    const response = doctors.map(doc => ({
      ...doc,
      specializations: specializations.filter(x => x.doctor_id === doc.id).map(x => x.id),
      clinics: clinics.filter(x => x.doctor_id === doc.id).map(x => x.id),
      hospitals: hospitals.filter(x => x.doctor_id === doc.id).map(x => x.id),
      procedures: procedures.filter(x => x.doctor_id === doc.id).map(x => x.id),
      services: services.filter(x => x.doctor_id === doc.id).map(x => x.id),
      symptoms: symptoms.filter(x => x.doctor_id === doc.id).map(x => x.id),
    }));

    res.json(response);

  } catch (err) {
    console.error("❌ getDoctors Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/* =====================================================
   GET DOCTOR BY ID (with mapping names)
   ===================================================== */
export const getDoctorById = async (req, res) => {
  const { id } = req.params;

  try {
    /* ------------------ DOCTOR ------------------ */
    const [[doctor]] = await pool.query(
      `
      SELECT
        d.*,
        c.name AS city_name,
        a.name AS area_name
      FROM doctors d
      LEFT JOIN cities c ON c.id = d.city_id
      LEFT JOIN areas a ON a.id = d.area_id
      WHERE d.id = ?
      `,
      [id]
    );

    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    /* ------------------ RELATIONS (IDS ONLY) ------------------ */
    const fetchIds = (table, col) =>
      pool.query(
        `SELECT ${col} AS id FROM ${table} WHERE doctor_id = ?`,
        [id]
      );

    const [
      [specializations],
      [clinics],
      [hospitals],
      [procedures],
      [services],
      [symptoms],
    ] = await Promise.all([
      fetchIds("doctor_specialization", "specialization_id"),
      fetchIds("doctor_clinic", "clinic_id"),
      fetchIds("doctor_hospital", "hospital_id"),
      fetchIds("doctor_procedure", "procedure_id"),
      fetchIds("doctor_service", "service_id"),
      fetchIds("doctor_symptom", "symptom_id"),
    ]);

    /* ------------------ IS ON CALL (FROM CLINICS) ------------------ */
    const [[onCallRow]] = await pool.query(
      `SELECT MAX(is_on_call) AS is_on_call FROM doctor_clinic WHERE doctor_id = ?`,
      [id]
    );

    /* ------------------ RESPONSE ------------------ */
    res.json({
      ...doctor,

      // NEW + EXISTING FIELDS (explicit, predictable)
      gender: doctor.gender,
      patients_count: doctor.patients_count,
      is_profile_claimed: !!doctor.is_profile_claimed,
      is_on_call: !!onCallRow?.is_on_call,

      // RELATION ARRAYS (IDS ONLY — PERFECT FOR FORM)
      specializations: specializations.map((x) => x.id),
      clinics: clinics.map((x) => x.id),
      hospitals: hospitals.map((x) => x.id),
      procedures: procedures.map((x) => x.id),
      services: services.map((x) => x.id),
      symptoms: symptoms.map((x) => x.id),

      // OPTIONAL OBJECTS (ADMIN VIEW)
      city: doctor.city_id
        ? { id: doctor.city_id, name: doctor.city_name }
        : null,
      area: doctor.area_id
        ? { id: doctor.area_id, name: doctor.area_name }
        : null,
    });

  } catch (err) {
    console.error("❌ getDoctorById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


/* =====================================================
   CREATE DOCTOR
   ===================================================== */
export const createDoctor = async (req, res) => {
  let imageKey = null;

  try {
    let imageUrl = null;

    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "doctors");
      imageUrl = uploaded.imageUrl;
      imageKey = uploaded.fileKey;
    }

    const body = req.body || {};

    const normalizeArray = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(Number).filter(Boolean);
      return [];
    };

    const specializations = normalizeArray(body.specializations);
    const clinics = normalizeArray(body.clinics);
    const hospitals = normalizeArray(body.hospitals);
    const procedures = normalizeArray(body.procedures);
    const services = normalizeArray(body.services);
    const symptoms = normalizeArray(body.symptoms);

    /* ------------------ INSERT DOCTOR ------------------ */
    const [insert] = await pool.query(
      `INSERT INTO doctors
      (
        name,
        designation,
        short_description,
        description,
        seo_title,
        seo_keywords,
        seo_description,
        json_schema,
        image_url,
        image_key,
        city_id,
        area_id,
        status,
        consultation_fee,
        rating,
        phone_1,
        phone_2,
        email,
        address,
        registration_number,
        degree,
        experience_years,
        gender,
        patients_count,
        is_profile_claimed,
        doctor_college,
        pass_year,
        doctor_council,
        doctor_council_year,
        created_at,
        created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name,
        body.designation || null,
        body.short_description || null,
        body.description || null,
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,
        imageUrl,
        imageKey,
        body.city_id ? Number(body.city_id) : null,
        body.area_id ? Number(body.area_id) : null,
        body.status || "active",
        body.consultation_fee ? Number(body.consultation_fee) : 0,
        body.rating ? Number(body.rating) : 0,
        body.phone_1 || null,
        body.phone_2 || null,
        body.email || null,
        body.address || null,
        body.registration_number || null,
        body.degree || null,
        body.experience_years ? Number(body.experience_years) : 0,
        body.gender || "male",
        body.patients_count ? Number(body.patients_count) : 0,
        body.is_profile_claimed ? 1 : 0,
        body.doctor_college || null,
        body.pass_year || null,
        body.doctor_council || null,
        body.doctor_council_year || null,
        new Date(),
        "admin",
      ]
    );

    const doctorId = insert.insertId;

    /* ------------------ SPECIALIZATIONS ------------------ */
    if (specializations.length) {
      await pool.query(
        `DELETE FROM doctor_specialization WHERE doctor_id = ?`,
        [doctorId]
      );

      const values = specializations.map((sid, idx) => [
        doctorId,
        sid,
        idx === 0 ? 1 : 0,
        idx + 1,
      ]);

      await pool.query(
        `INSERT INTO doctor_specialization
         (doctor_id, specialization_id, is_primary, priority)
         VALUES ?`,
        [values]
      );
    }

    const [[primarySpec]] = await pool.query(
      `SELECT s.name
       FROM doctor_specialization ds
       JOIN specializations s ON s.id = ds.specialization_id
       WHERE ds.doctor_id = ? AND ds.is_primary = 1
       LIMIT 1`,
      [doctorId]
    );

    const slug = await generateUniqueDoctorSlug(
      body.name,
      primarySpec?.name
    );

    await pool.query(
      `UPDATE doctors SET slug = ? WHERE id = ?`,
      [slug, doctorId]
    );

    /* ------------------ CLINICS ------------------ */
    if (clinics.length) {
      const values = clinics.map((cid, idx) => [
        doctorId,
        cid,
        idx === 0 ? 1 : 0,
        body.consultation_fee || null,
        null,
        null,
        body.is_on_call ? 1 : 0, // ADMIN CONTROLLED (TEMP)
      ]);

      await pool.query(
        `INSERT INTO doctor_clinic
         (
           doctor_id,
           clinic_id,
           is_primary,
           consultation_fee,
           timings,
           practice_address,
           is_on_call
         )
         VALUES ?`,
        [values]
      );
    }

    /* ------------------ HOSPITALS ------------------ */
    if (hospitals.length) {
      const values = hospitals.map((hid) => [doctorId, hid]);

      await pool.query(
        `INSERT INTO doctor_hospital (doctor_id, hospital_id)
         VALUES ?
         ON DUPLICATE KEY UPDATE doctor_id = doctor_id`,
        [values]
      );
    }

    /* ------------------ OTHER RELATIONS ------------------ */
    const insertMany = async (table, col, ids) => {
      if (!ids.length) return;
      const values = ids.map((id) => [doctorId, id]);
      await pool.query(
        `INSERT INTO ${table} (doctor_id, ${col}) VALUES ?`,
        [values]
      );
    };

    await insertMany("doctor_procedure", "procedure_id", procedures);
    await insertMany("doctor_service", "service_id", services);
    await insertMany("doctor_symptom", "symptom_id", symptoms);

    res.status(201).json({ id: doctorId, slug });

  } catch (err) {
    console.error("❌ createDoctor:", err);
    if (imageKey) await deleteFromS3(imageKey);
    res.status(500).json({ error: "Failed to create doctor" });
  }
};



/* =====================================================
   UPDATE DOCTOR
   ===================================================== */
export const updateDoctor = async (req, res) => {
  const { id } = req.params;
  let newImageKey = null;

  try {
    /* ------------------ FETCH EXISTING ------------------ */
    const [[existing]] = await pool.query(
      `SELECT name, slug, image_key FROM doctors WHERE id = ?`,
      [id]
    );

    if (!existing) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const body = req.body || {};

    /* ------------------ IMAGE UPLOAD ------------------ */
    let newImageUrl = null;
    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "doctors");
      newImageUrl = uploaded.imageUrl;
      newImageKey = uploaded.fileKey;
    }

    /* ------------------ UPDATE MAIN DOCTOR ------------------ */
    await pool.query(
      `UPDATE doctors SET
        name = ?,
        designation = ?,
        short_description = ?,
        description = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        json_schema = ?,
        city_id = ?,
        area_id = ?,
        status = ?,
        consultation_fee = ?,
        rating = ?,
        phone_1 = ?,
        phone_2 = ?,
        email = ?,
        address = ?,
        registration_number = ?,
        degree = ?,
        experience_years = ?,
        gender = ?,
        patients_count = ?,
        is_profile_claimed = ?,
        doctor_college = ?,
        pass_year = ?,
        doctor_council = ?,
        doctor_council_year = ?,
        updated_at = ?,
        updated_by = ?
        ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
      WHERE id = ?`,
      [
        body.name || existing.name,
        body.designation ?? null,
        body.short_description ?? null,
        body.description ?? null,
        body.seo_title ?? null,
        body.seo_keywords ?? null,
        body.seo_description ?? null,
        body.json_schema ?? null,
        body.city_id ? Number(body.city_id) : null,
        body.area_id ? Number(body.area_id) : null,
        body.status || "active",
        body.consultation_fee ? Number(body.consultation_fee) : 0,
        body.rating ? Number(body.rating) : 0,
        body.phone_1 ?? null,
        body.phone_2 ?? null,
        body.email ?? null,
        body.address ?? null,
        body.registration_number ?? null,
        body.degree ?? null,
        body.experience_years ? Number(body.experience_years) : 0,
        body.gender || "male",
        body.patients_count ? Number(body.patients_count) : 0, // TEMP
        body.is_profile_claimed ? 1 : 0,
        body.doctor_college ?? null,
        body.pass_year ?? null,
        body.doctor_council ?? null,
        body.doctor_council_year ?? null,
        new Date(),
        'admin',
        ...(newImageUrl ? [newImageUrl, newImageKey] : []),
        id,
      ]
    );

    /* ------------------ NORMALIZE ------------------ */
    const normalizeArray = (v) => {
      if (v === undefined) return undefined;
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(Number).filter(Boolean);
      return [];
    };

    /* ------------------ SPECIALIZATIONS ------------------ */
    const specializations = normalizeArray(body.specializations);
    if (specializations !== undefined) {
      await pool.query(
        `DELETE FROM doctor_specialization WHERE doctor_id = ?`,
        [id]
      );

      if (specializations.length) {
        const values = specializations.map((sid, idx) => [
          id,
          sid,
          idx === 0 ? 1 : 0,
          idx + 1,
        ]);

        await pool.query(
          `INSERT INTO doctor_specialization
           (doctor_id, specialization_id, is_primary, priority)
           VALUES ?`,
          [values]
        );
      }
    }

    /* ------------------ SLUG (ONLY IF NAME CHANGED) ------------------ */
    let slug = existing.slug;

    if (body.name && body.name !== existing.name) {
      const [[primarySpec]] = await pool.query(
        `SELECT s.name
         FROM doctor_specialization ds
         JOIN specializations s ON s.id = ds.specialization_id
         WHERE ds.doctor_id = ? AND ds.is_primary = 1
         LIMIT 1`,
        [id]
      );

      slug = await generateUniqueDoctorSlug(
        body.name,
        primarySpec?.name || null,
        id
      );

      await pool.query(`UPDATE doctors SET slug = ? WHERE id = ?`, [slug, id]);
    }

    /* ------------------ GENERIC RELATIONS ------------------ */
    const replaceRelations = async (table, col, values) => {
      if (values === undefined) return;
      await pool.query(`DELETE FROM ${table} WHERE doctor_id = ?`, [id]);
      if (!values.length) return;
      const rows = values.map(v => [id, v]);
      await pool.query(
        `INSERT INTO ${table} (doctor_id, ${col}) VALUES ?`,
        [rows]
      );
    };

    await replaceRelations("doctor_procedure", "procedure_id", normalizeArray(body.procedures));
    await replaceRelations("doctor_service", "service_id", normalizeArray(body.services));
    await replaceRelations("doctor_symptom", "symptom_id", normalizeArray(body.symptoms));

    /* ------------------ CLINICS ------------------ */
    const clinics = normalizeArray(body.clinics);
    if (clinics !== undefined) {
      await pool.query(`DELETE FROM doctor_clinic WHERE doctor_id = ?`, [id]);

      if (clinics.length) {
        const values = clinics.map((cid, idx) => [
          id,
          cid,
          idx === 0 ? 1 : 0,
          body.consultation_fee || null,
          null,
          null,
          body.is_on_call ? 1 : 0, // TEMP admin control
        ]);

        await pool.query(
          `INSERT INTO doctor_clinic
           (doctor_id, clinic_id, is_primary, consultation_fee, timings, practice_address, is_on_call)
           VALUES ?`,
          [values]
        );
      }
    }

    /* ------------------ HOSPITALS ------------------ */
    const hospitals = normalizeArray(body.hospitals);
    if (hospitals !== undefined) {
      await pool.query(`DELETE FROM doctor_hospital WHERE doctor_id = ?`, [id]);

      if (hospitals.length) {
        const rows = hospitals.map(hid => [id, hid]);
        await pool.query(
          `INSERT INTO doctor_hospital (doctor_id, hospital_id)
           VALUES ?
           ON DUPLICATE KEY UPDATE doctor_id = doctor_id`,
          [rows]
        );
      }
    }

    /* ------------------ DELETE OLD IMAGE AFTER SUCCESS ------------------ */
    if (newImageKey && existing.image_key && existing.image_key !== newImageKey) {
      await deleteFromS3(existing.image_key);
    }

    res.json({ ok: true, slug });

  } catch (err) {
    console.error("❌ updateDoctor:", err);

    if (newImageKey) {
      await deleteFromS3(newImageKey);
    }

    res.status(500).json({ error: "Failed to update doctor" });
  }
};




/* =====================================================
   DELETE DOCTOR
   ===================================================== */
export const deleteDoctor = async (req, res) => {
  const { id } = req.params;

  try {
    const [[doctor]] = await pool.query(
      `SELECT image_key FROM doctors WHERE id = ?`,
      [id]
    );

    if (!doctor) {
      return res.status(404).json({ error: "Doctor not found" });
    }

    const imageKey = doctor.image_key;

    /* ------------------ DELETE NON-CASCADE RELATIONS ------------------ */
    await pool.query(`DELETE FROM doctor_specialization WHERE doctor_id = ?`, [id]);
    await pool.query(`DELETE FROM doctor_hospital WHERE doctor_id = ?`, [id]);
    await pool.query(`DELETE FROM doctor_procedure WHERE doctor_id = ?`, [id]);
    await pool.query(`DELETE FROM doctor_service WHERE doctor_id = ?`, [id]);
    await pool.query(`DELETE FROM doctor_symptom WHERE doctor_id = ?`, [id]);

    /* ------------------ DELETE DOCTOR (CASCADE HANDLES doctor_clinic) ------------------ */
    await pool.query(`DELETE FROM doctors WHERE id = ?`, [id]);

    /* ------------------ DELETE IMAGE AFTER DB SUCCESS ------------------ */
    if (imageKey) {
      await deleteFromS3(imageKey);
    }

    res.json({ ok: true });

  } catch (err) {
    console.error("❌ deleteDoctor Error:", err);
    res.status(500).json({ error: "Failed to delete doctor" });
  }
};


