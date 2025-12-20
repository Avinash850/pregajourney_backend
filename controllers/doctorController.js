import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";


export const getDoctors = async (req, res) => {
  try {

    // const [doctors] = await pool.query(
    //   `SELECT 
    //       id, name, slug, designation, image_url, image_key, short_description,
    //       status, city_id, area_id, consultation_fee, rating, phone_1, phone_2,
    //       email, address, registration_number, degree, experience_years, created_at
    //    FROM doctors
    //    ORDER BY id DESC`
    // );
    // 1) Load doctors basic info
    const [doctors] = await pool.query(
      `SELECT 
          *
       FROM doctors
       ORDER BY id DESC`
    );

    if (doctors.length === 0) return res.json([]);

    const doctorIds = doctors.map((d) => d.id);

    // 2) Fetch all mappings in one go (faster)
    const [specializations] = await pool.query(
      `SELECT doctor_id, specialization_id AS id
       FROM doctor_specialization
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    const [clinics] = await pool.query(
      `SELECT doctor_id, clinic_id AS id
       FROM doctor_clinic
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    const [hospitals] = await pool.query(
      `SELECT doctor_id, hospital_id AS id
       FROM doctor_hospital
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    const [procedures] = await pool.query(
      `SELECT doctor_id, procedure_id AS id
       FROM doctor_procedure
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    const [services] = await pool.query(
      `SELECT doctor_id, service_id AS id
       FROM doctor_service
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    const [symptoms] = await pool.query(
      `SELECT doctor_id, symptom_id AS id
       FROM doctor_symptom
       WHERE doctor_id IN (?)`,
      [doctorIds]
    );

    // 3) Attach mapping IDs to each doctor
    const response = doctors.map((doc) => ({
      ...doc,

      specializations: specializations
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),

      clinics: clinics
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),

      hospitals: hospitals
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),

      procedures: procedures
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),

      services: services
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),

      symptoms: symptoms
        .filter((x) => x.doctor_id === doc.id)
        .map((x) => x.id),
    }));

    res.json(response);
  } catch (error) {
    console.error("❌ getDoctors Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};




export const getDoctorById = async (req, res) => {
  const { id } = req.params;
  try {
    // Get main doctor row
    const [[doctorRows]] = await pool.query(`SELECT * FROM doctors WHERE id = ?`, [id]);
    if (!doctorRows) {
      return res.status(404).json({ error: "Doctor not found" });
    }
    const doctor = doctorRows;

    // Helper to fetch related ids (and optionally names)
    const getRelation = async (table, joinTable = null, joinCol = "id", selectCols = "id") => {
      // If joinTable is provided, return objects {id, name} by joining master table
      if (joinTable) {
        const [rel] = await pool.query(
          `SELECT m.id, m.name
           FROM ${table} r
           JOIN ${joinTable} m ON m.id = r.${joinCol}
           WHERE r.doctor_id = ?`,
          [id]
        );
        return rel;
      } else {
        // only ids
        const [rel] = await pool.query(`SELECT * FROM ${table} WHERE doctor_id = ?`, [id]);
        return rel;
      }
    };

    // Fetch relation arrays (return arrays of objects {id, name} to make frontend friendly)
    const [specializations] = await pool.query(
      `SELECT s.id, s.name FROM doctor_specialization ds JOIN specializations s ON s.id = ds.specialization_id WHERE ds.doctor_id = ?`,
      [id]
    );

    const [clinics] = await pool.query(
      `SELECT c.id, c.name FROM doctor_clinic dc JOIN clinics c ON c.id = dc.clinic_id WHERE dc.doctor_id = ?`,
      [id]
    );

    const [hospitals] = await pool.query(
      `SELECT h.id, h.name FROM doctor_hospital dh JOIN hospitals h ON h.id = dh.hospital_id WHERE dh.doctor_id = ?`,
      [id]
    );

    const [procedures] = await pool.query(
      `SELECT p.id, p.name FROM doctor_procedure dp JOIN procedures p ON p.id = dp.procedure_id WHERE dp.doctor_id = ?`,
      [id]
    );

    const [services] = await pool.query(
      `SELECT s.id, s.name FROM doctor_service ds JOIN services s ON s.id = ds.service_id WHERE ds.doctor_id = ?`,
      [id]
    );

    const [symptoms] = await pool.query(
      `SELECT s.id, s.name FROM doctor_symptom dsy JOIN symptoms s ON s.id = dsy.symptom_id WHERE dsy.doctor_id = ?`,
      [id]
    );

    // Optionally get city/area names
    let city = null;
    let area = null;
    if (doctor.city_id) {
      const [crows] = await pool.query(`SELECT id, name FROM cities WHERE id = ?`, [doctor.city_id]);
      city = crows?.[0] ?? null;
    }
    if (doctor.area_id) {
      const [arows] = await pool.query(`SELECT id, name, city_id FROM areas WHERE id = ?`, [doctor.area_id]);
      area = arows?.[0] ?? null;
    }

    // Compose response
    const result = {
      ...doctor,
      specializations,
      clinics,
      hospitals,
      procedures,
      services,
      symptoms,
      city,
      area,
    };

    res.json(result);
  } catch (error) {
    console.error("❌ getDoctorById Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};



// const slugify = (text) =>
//   text
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9\s-]/g, "")
//     .replace(/\s+/g, "-")
//     .replace(/-+/g, "-");

// const generateUniqueDoctorSlug = async (connection, doctorName, specializationName, excludeDoctorId = null) => {
//   let base = `dr-${doctorName}`;
//   if (specializationName) {
//     base += `-${specializationName}`;
//   }

//   base = slugify(base);

//   let slug = base;
//   let counter = 1;

//   while (true) {
//     const params = excludeDoctorId ? [slug, excludeDoctorId] : [slug];
//     const sql = excludeDoctorId
//       ? `SELECT id FROM doctors WHERE slug = ? AND id != ? LIMIT 1`
//       : `SELECT id FROM doctors WHERE slug = ? LIMIT 1`;

//     const [[exists]] = await connection.query(sql, params);
//     if (!exists) break;

//     slug = `${base}-${counter}`;
//     counter++;
//   }

//   return slug;
// };




// export const createDoctor = async (req, res) => {
//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // 1️⃣ Upload image
//     let imageUrl = null;
//     let imageKey = null;

//     if (req.file) {
//       const uploaded = await uploadImageToS3(req.file, "doctors");
//       imageUrl = uploaded.imageUrl;
//       imageKey = uploaded.fileKey;
//     }

//     const body = req.body || {};

//     const normalizeArray = (v) => {
//       if (!v) return [];
//       if (Array.isArray(v)) return v.map(Number).filter(Boolean);
//       return v.split(",").map(Number).filter(Boolean);
//     };

//     const specializations = normalizeArray(body.specializations);

//     // 2️⃣ Insert doctor WITHOUT slug
//     const [insert] = await connection.query(
//       `
//       INSERT INTO doctors
//       (name, designation, short_description, description, seo_title,
//        seo_keywords, seo_description, json_schema, image_url, image_key,
//        city_id, area_id, status, consultation_fee, rating, phone_1,
//        phone_2, email, address, registration_number, degree, experience_years)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `,
//       [
//         body.name,
//         body.designation || null,
//         body.short_description || null,
//         body.description || null,
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//         imageUrl,
//         imageKey,
//         body.city_id || null,
//         body.area_id || null,
//         body.status || "active",
//         body.consultation_fee || 0,
//         body.rating || 0,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.email || null,
//         body.address || null,
//         body.registration_number || null,
//         body.degree || null,
//         body.experience_years || null,
//       ]
//     );

//     const doctorId = insert.insertId;

//     // 3️⃣ Insert specialization mapping
//     if (specializations.length) {
//       const values = specializations.map((sid, idx) => [
//         doctorId,
//         sid,
//         idx === 0 ? 1 : 0, // primary
//         idx + 1
//       ]);

//       await connection.query(
//         `INSERT INTO doctor_specialization (doctor_id, specialization_id, is_primary, priority) VALUES ?`,
//         [values]
//       );
//     }

//     // 4️⃣ Fetch primary specialization name
//     const [[primarySpec]] = await connection.query(
//       `
//       SELECT s.name
//       FROM doctor_specialization ds
//       JOIN specializations s ON s.id = ds.specialization_id
//       WHERE ds.doctor_id = ? AND ds.is_primary = 1
//       LIMIT 1
//       `,
//       [doctorId]
//     );

//     // 5️⃣ Generate slug
//     const slug = await generateUniqueDoctorSlug(
//       connection,
//       body.name,
//       primarySpec?.name || null
//     );

//     // 6️⃣ Update slug
//     await connection.query(
//       `UPDATE doctors SET slug = ? WHERE id = ?`,
//       [slug, doctorId]
//     );

//     await connection.commit();

//     res.status(201).json({ id: doctorId, slug });

//   } catch (err) {
//     await connection.rollback();
//     console.error("❌ createDoctor:", err);
//     res.status(500).json({ error: "Failed to create doctor" });
//   } finally {
//     connection.release();
//   }
// };




const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

const generateUniqueDoctorSlug = async (connection, doctorName, specializationName, excludeDoctorId = null) => {
  let base = `dr-${doctorName}`;
  if (specializationName) {
    base += `-${specializationName}`;
  }
  base = slugify(base);

  let slug = base;
  let counter = 1;

  while (true) {
    const params = excludeDoctorId ? [slug, excludeDoctorId] : [slug];
    const sql = excludeDoctorId
      ? `SELECT id FROM doctors WHERE slug = ? AND id != ? LIMIT 1`
      : `SELECT id FROM doctors WHERE slug = ? LIMIT 1`;

    const [[exists]] = await connection.query(sql, params);
    if (!exists) break;

    slug = `${base}-${counter}`;
    counter++;
  }

  return slug;
};

export const createDoctor = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // ------------------------
    // 1️⃣ Upload image to S3
    // ------------------------
    let imageUrl = null;
    let imageKey = null;

    if (req.file) {
      const uploaded = await uploadImageToS3(req.file, "doctors");
      imageUrl = uploaded.imageUrl;
      imageKey = uploaded.fileKey;
    }

    // ------------------------
    // 2️⃣ Normalize body values
    // ------------------------
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

    // ------------------------
    // 3️⃣ Insert doctor row (without slug)
    // ------------------------
    const [insert] = await connection.query(
      `
      INSERT INTO doctors
      (name, designation, short_description, description, seo_title,
       seo_keywords, seo_description, json_schema, image_url, image_key,
       city_id, area_id, status, consultation_fee, rating, phone_1,
       phone_2, email, address, registration_number, degree, experience_years)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
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
        body.experience_years ? Number(body.experience_years) : null,
      ]
    );

    const doctorId = insert.insertId;

    // ------------------------
    // 4️⃣ Insert specialization mapping
    // ------------------------
    if (specializations.length) {
      const values = specializations.map((sid, idx) => [
        doctorId,
        sid,
        idx === 0 ? 1 : 0, // is_primary
        idx + 1              // priority
      ]);

      await connection.query(
        `INSERT INTO doctor_specialization (doctor_id, specialization_id, is_primary, priority) VALUES ?`,
        [values]
      );
    }

    // ------------------------
    // 5️⃣ Fetch primary specialization name
    // ------------------------
    const [[primarySpec]] = await connection.query(
      `
      SELECT s.name
      FROM doctor_specialization ds
      JOIN specializations s ON s.id = ds.specialization_id
      WHERE ds.doctor_id = ? AND ds.is_primary = 1
      LIMIT 1
      `,
      [doctorId]
    );

    // ------------------------
    // 6️⃣ Generate slug
    // ------------------------
    const slug = await generateUniqueDoctorSlug(connection, body.name, primarySpec?.name || null);

    await connection.query(`UPDATE doctors SET slug = ? WHERE id = ?`, [slug, doctorId]);

    // ------------------------
    // 7️⃣ Insert other mapping tables
    // ------------------------
    const insertMany = async (table, col, ids) => {
      if (!ids || ids.length === 0) return;
      const values = ids.map((x) => [doctorId, x]);
      await connection.query(`INSERT INTO ${table} (doctor_id, ${col}) VALUES ?`, [values]);
    };

    await insertMany("doctor_clinic", "clinic_id", clinics);
    await insertMany("doctor_hospital", "hospital_id", hospitals);
    await insertMany("doctor_procedure", "procedure_id", procedures);
    await insertMany("doctor_service", "service_id", services);
    await insertMany("doctor_symptom", "symptom_id", symptoms);

    // ------------------------
    // 8️⃣ Commit transaction
    // ------------------------
    await connection.commit();

    res.status(201).json({ id: doctorId, slug });

  } catch (err) {
    await connection.rollback();
    console.error("❌ createDoctor:", err);
    res.status(500).json({ error: "Failed to create doctor" });
  } finally {
    connection.release();
  }
};




// export const updateDoctor = async (req, res) => {
//   const { id } = req.params;
//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     const [[existing]] = await connection.query(
//       `SELECT name FROM doctors WHERE id = ?`,
//       [id]
//     );

//     if (!existing) {
//       await connection.rollback();
//       return res.status(404).json({ error: "Doctor not found" });
//     }

//     const body = req.body || {};

//     // 1️⃣ Update doctor core fields (NO slug)
//     await connection.query(
//       `
//       UPDATE doctors SET
//         name = ?, designation = ?, short_description = ?, description = ?,
//         seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?,
//         city_id = ?, area_id = ?, status = ?, consultation_fee = ?, rating = ?,
//         phone_1 = ?, phone_2 = ?, email = ?, address = ?, registration_number = ?,
//         degree = ?, experience_years = ?
//       WHERE id = ?
//       `,
//       [
//         body.name,
//         body.designation || null,
//         body.short_description || null,
//         body.description || null,
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//         body.city_id || null,
//         body.area_id || null,
//         body.status || "active",
//         body.consultation_fee || 0,
//         body.rating || 0,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.email || null,
//         body.address || null,
//         body.registration_number || null,
//         body.degree || null,
//         body.experience_years || null,
//         id,
//       ]
//     );

//     // 2️⃣ Update specialization mapping (same as before)
//     await connection.query(`DELETE FROM doctor_specialization WHERE doctor_id = ?`, [id]);

//     const specs = (body.specializations || []).map(Number);
//     if (specs.length) {
//       const values = specs.map((sid, idx) => [id, sid, idx === 0 ? 1 : 0, idx + 1]);
//       await connection.query(
//         `INSERT INTO doctor_specialization (doctor_id, specialization_id, is_primary, priority) VALUES ?`,
//         [values]
//       );
//     }

//     // 3️⃣ Fetch new primary specialization
//     const [[primarySpec]] = await connection.query(
//       `
//       SELECT s.name
//       FROM doctor_specialization ds
//       JOIN specializations s ON s.id = ds.specialization_id
//       WHERE ds.doctor_id = ? AND ds.is_primary = 1
//       LIMIT 1
//       `,
//       [id]
//     );

//     // 4️⃣ Regenerate slug if needed
//     const slug = await generateUniqueDoctorSlug(
//       connection,
//       body.name,
//       primarySpec?.name || null,
//       id
//     );

//     await connection.query(
//       `UPDATE doctors SET slug = ? WHERE id = ?`,
//       [slug, id]
//     );

//     await connection.commit();
//     res.json({ ok: true, slug });

//   } catch (err) {
//     await connection.rollback();
//     console.error("❌ updateDoctor:", err);
//     res.status(500).json({ error: "Failed to update doctor" });
//   } finally {
//     connection.release();
//   }
// };



export const updateDoctor = async (req, res) => {
  const { id } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1️⃣ Fetch existing doctor and primary specialization
    const [[existing]] = await connection.query(
      `SELECT name FROM doctors WHERE id = ?`,
      [id]
    );

    if (!existing) {
      await connection.rollback();
      return res.status(404).json({ error: "Doctor not found" });
    }

    const body = req.body || {};

    // 2️⃣ Update doctor core fields (without slug yet)
    await connection.query(
      `
      UPDATE doctors SET
        name = ?, designation = ?, short_description = ?, description = ?,
        seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?,
        city_id = ?, area_id = ?, status = ?, consultation_fee = ?, rating = ?,
        phone_1 = ?, phone_2 = ?, email = ?, address = ?, registration_number = ?,
        degree = ?, experience_years = ?
      WHERE id = ?
      `,
      [
        body.name,
        body.designation || null,
        body.short_description || null,
        body.description || null,
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,
        body.city_id || null,
        body.area_id || null,
        body.status || "active",
        body.consultation_fee || 0,
        body.rating || 0,
        body.phone_1 || null,
        body.phone_2 || null,
        body.email || null,
        body.address || null,
        body.registration_number || null,
        body.degree || null,
        body.experience_years || null,
        id,
      ]
    );

    // 3️⃣ Delete old specialization mappings
    await connection.query(`DELETE FROM doctor_specialization WHERE doctor_id = ?`, [id]);

    // 4️⃣ Insert new specialization mappings with correct primary
    const specs = (body.specializations || []).map(Number);
    if (specs.length) {
      // Fetch previous primary specialization
      const [[oldPrimary]] = await connection.query(
        `SELECT specialization_id FROM doctor_specialization WHERE doctor_id = ? AND is_primary = 1 LIMIT 1`,
        [id]
      );

      const values = specs.map((sid, idx) => {
        let isPrimary = 0;

        // Preserve old primary if still in new array
        if (oldPrimary && sid === oldPrimary.specialization_id) {
          isPrimary = 1;
        }

        // If no old primary preserved yet, first one becomes primary
        if (!oldPrimary && idx === 0) {
          isPrimary = 1;
        }

        return [id, sid, isPrimary, idx + 1];
      });

      await connection.query(
        `INSERT INTO doctor_specialization (doctor_id, specialization_id, is_primary, priority) VALUES ?`,
        [values]
      );
    }

    // 5️⃣ Fetch current primary specialization for slug
    const [[primarySpec]] = await connection.query(
      `
      SELECT s.name
      FROM doctor_specialization ds
      JOIN specializations s ON s.id = ds.specialization_id
      WHERE ds.doctor_id = ? AND ds.is_primary = 1
      LIMIT 1
      `,
      [id]
    );

    // 6️⃣ Regenerate slug based on new name & primary specialization
    const slug = await generateUniqueDoctorSlug(
      connection,
      body.name,
      primarySpec?.name || null,
      id
    );

    await connection.query(`UPDATE doctors SET slug = ? WHERE id = ?`, [slug, id]);

    await connection.commit();

    res.json({ ok: true, slug });

  } catch (err) {
    await connection.rollback();
    console.error("❌ updateDoctor:", err);
    res.status(500).json({ error: "Failed to update doctor" });
  } finally {
    connection.release();
  }
};


export const deleteDoctor = async (req, res) => {
    const { id } = req.params;

    try {
        const connection = await pool.getConnection();

        try {
        await connection.beginTransaction();

        // 1) Fetch image_key BEFORE deleting doctor
        const [[doctor]] = await connection.query(
            `SELECT image_key FROM doctors WHERE id = ?`,
            [id]
        );

        if (!doctor) {
            await connection.rollback();
            return res.status(404).json({ error: "Doctor not found" });
        }

        const imageKey = doctor.image_key; // save for deletion after commit

        // 2) Delete relational mappings
        await connection.query(`DELETE FROM doctor_specialization WHERE doctor_id = ?`, [id]);
        await connection.query(`DELETE FROM doctor_clinic WHERE doctor_id = ?`, [id]);
        await connection.query(`DELETE FROM doctor_hospital WHERE doctor_id = ?`, [id]);
        await connection.query(`DELETE FROM doctor_procedure WHERE doctor_id = ?`, [id]);
        await connection.query(`DELETE FROM doctor_service WHERE doctor_id = ?`, [id]);
        await connection.query(`DELETE FROM doctor_symptom WHERE doctor_id = ?`, [id]);

        // 3) Delete main doctor row
        await connection.query(`DELETE FROM doctors WHERE id = ?`, [id]);

        // 4) Commit transaction
        await connection.commit();

        // 5) Delete S3 image ONLY after DB commit
        if (imageKey) {
            await deleteFromS3(imageKey);
        }

        res.json({ ok: true });

        } catch (err) {
        await connection.rollback();
        console.error("❌ deleteDoctor Transaction Error:", err);
        res.status(500).json({ error: "Failed to delete doctor" });
        } finally {
        connection.release();
        }

    } catch (err) {
        console.error("❌ deleteDoctor Connection Error:", err);
        res.status(500).json({ error: "Server error" });
    }
};

