import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";


// export const getDoctors = async (req, res) => {
//   try {
//     const [rows] = await pool.query(
//       `SELECT id, name, slug, designation, image_url, short_description, status, created_at
//        FROM doctors
//        ORDER BY id DESC`
//     );
//     res.json(rows);
//   } catch (error) {
//     console.error("❌ getDoctors Error:", error);
//     res.status(500).json({ error: "Server error" });
//   }
// };


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

// export const createDoctor = async (req, res) => {
//   // Assumes form-data. req.body will contain fields; req.file optional image (if you use multer)
//   // convert array fields (they may come as repeated keys or CSV)
//   try {
//     const connection = await pool.getConnection();
//     try {
//       await connection.beginTransaction();

//       // If you use multer, your file will be in req.file
//       const file = req.file;
//       const imageUrl = await uploadToS3(file);

//       // normalize incoming fields
//       const body = req.body || {};

//       const normalizeArray = (v) => {
//         if (v == null) return [];
//         if (Array.isArray(v)) return v.map((x) => Number(x)).filter(Boolean);
//         // If value is comma separated string
//         if (typeof v === "string") {
//           if (v.trim() === "") return [];
//           return v.split(",").map((x) => Number(x)).filter(Boolean);
//         }
//         return [];
//       };

//       const specializations = normalizeArray(body.specializations);
//       const clinics = normalizeArray(body.clinics);
//       const hospitals = normalizeArray(body.hospitals);
//       const procedures = normalizeArray(body.procedures);
//       const services = normalizeArray(body.services);
//       const symptoms = normalizeArray(body.symptoms);

//       // Doctor main fields (adjust fields as per your doctors table)
//       const insertDoctorSql = `INSERT INTO doctors
//         (name, slug, designation, type, short_description, description, seo_title, seo_keywords, seo_description, json_schema, image_url, city_id, area_id, status, consultation_fee, rating, phone_1, phone_2, email, address, registration_number, degree, experience_years)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

//       const insertDoctorParams = [
//         body.name || "",
//         body.slug || null,
//         body.designation || null,
//         body.type || null,
//         body.short_description || null,
//         body.description || null,
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//         imageUrl || null,
//         body.city_id ? Number(body.city_id) : null,
//         body.area_id ? Number(body.area_id) : null,
//         body.status || "active",
//         body.consultation_fee ? Number(body.consultation_fee) : 0,
//         body.rating ? Number(body.rating) : 0,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.email || null,
//         body.address || null,
//         body.registration_number || null,
//         body.degree || null,
//         body.experience_years ? Number(body.experience_years) : null,
//       ];

//       const [insertResult] = await connection.query(insertDoctorSql, insertDoctorParams);
//       const doctorId = insertResult.insertId;

//       // Insert relation helpers
//       const insertMany = async (table, colName, ids) => {
//         if (!ids || ids.length === 0) return;
//         const values = ids.map((id) => [doctorId, id]);
//         const sql = `INSERT INTO ${table} (doctor_id, ${colName}) VALUES ?`;
//         await connection.query(sql, [values]);
//       };

//       await insertMany("doctor_specialization", "specialization_id", specializations);
//       await insertMany("doctor_clinic", "clinic_id", clinics);
//       await insertMany("doctor_hospital", "hospital_id", hospitals);
//       await insertMany("doctor_procedure", "procedure_id", procedures);
//       await insertMany("doctor_service", "service_id", services);
//       await insertMany("doctor_symptom", "symptom_id", symptoms);

//       await connection.commit();

//       // Return the created doctor id (and optionally fetch the new full object)
//       res.status(201).json({ id: doctorId });
//     } catch (err) {
//       await connection.rollback();
//       console.error("❌ createDoctor Transaction Error:", err);
//       res.status(500).json({ error: "Failed to create doctor" });
//     } finally {
//       connection.release();
//     }
//   } catch (err) {
//     console.error("❌ createDoctor Connection Error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// };



export const createDoctor = async (req, res) => {
  try {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // ------------------------
      // 1) Upload image to S3
      // ------------------------
      const file = req.file;
      let imageUrl = null;
      let imageKey = null;

      if (file) {
        const uploadResult = await uploadImageToS3(file, "doctors"); 
        imageUrl = uploadResult.imageUrl;
        imageKey = uploadResult.fileKey;
      }

      // ------------------------
      // 2) Normalize body values
      // ------------------------
      const body = req.body || {};

      const normalizeArray = (v) => {
        if (v == null) return [];
        if (Array.isArray(v)) return v.map((x) => Number(x)).filter(Boolean);
        if (typeof v === "string") {
          if (v.trim() === "") return [];
          return v.split(",").map((x) => Number(x)).filter(Boolean);
        }
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const clinics = normalizeArray(body.clinics);
      const hospitals = normalizeArray(body.hospitals);
      const procedures = normalizeArray(body.procedures);
      const services = normalizeArray(body.services);
      const symptoms = normalizeArray(body.symptoms);

      // ------------------------
      // 3) INSERT doctor row
      // ------------------------
      const insertDoctorSql = `
        INSERT INTO doctors
        (name, slug, designation, short_description, description, seo_title, seo_keywords, 
         seo_description, json_schema, image_url, image_key, city_id, area_id, status, 
         consultation_fee, rating, phone_1, phone_2, email, address, registration_number, 
         degree, experience_years)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const insertDoctorParams = [
        body.name || "",
        body.slug || null,
        body.designation || null,
        body.short_description || null,
        body.description || null,
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,

        // S3 fields
        imageUrl || null,
        imageKey || null,

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
      ];

      const [insertResult] = await connection.query(insertDoctorSql, insertDoctorParams);
      const doctorId = insertResult.insertId;

      // ------------------------
      // 4) Insert mapping tables
      // ------------------------
      const insertMany = async (table, colName, ids) => {
        if (!ids || ids.length === 0) return;
        const values = ids.map((id) => [doctorId, id]);
        const sql = `INSERT INTO ${table} (doctor_id, ${colName}) VALUES ?`;
        await connection.query(sql, [values]);
      };

      await insertMany("doctor_specialization", "specialization_id", specializations);
      await insertMany("doctor_clinic", "clinic_id", clinics);
      await insertMany("doctor_hospital", "hospital_id", hospitals);
      await insertMany("doctor_procedure", "procedure_id", procedures);
      await insertMany("doctor_service", "service_id", services);
      await insertMany("doctor_symptom", "symptom_id", symptoms);

      // ------------------------
      // 5) Commit
      // ------------------------
      await connection.commit();

      res.status(201).json({ id: doctorId });

    } catch (err) {
      await connection.rollback();
      console.error("❌ createDoctor Transaction Error:", err);
      res.status(500).json({ error: "Failed to create doctor" });
    } finally {
      connection.release();
    }

  } catch (err) {
    console.error("❌ createDoctor Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};




// export const updateDoctor = async (req, res) => {
//   const { id } = req.params;
//   try {
//     const connection = await pool.getConnection();
//     try {
//       await connection.beginTransaction();

//       // verify exists
//       const [[existing]] = await connection.query(`SELECT id, image_url FROM doctors WHERE id = ?`, [id]);
//       if (!existing) {
//         await connection.rollback();
//         return res.status(404).json({ error: "Doctor not found" });
//       }

//       const file = req.file;
//       const imageUrl = await uploadToS3(file); // if file null, returns null; we will keep existing if null

//       const body = req.body || {};
//       const normalizeArray = (v) => {
//         if (v == null) return [];
//         if (Array.isArray(v)) return v.map((x) => Number(x)).filter(Boolean);
//         if (typeof v === "string") {
//           if (v.trim() === "") return [];
//           return v.split(",").map((x) => Number(x)).filter(Boolean);
//         }
//         return [];
//       };

//       const specializations = normalizeArray(body.specializations);
//       const clinics = normalizeArray(body.clinics);
//       const hospitals = normalizeArray(body.hospitals);
//       const procedures = normalizeArray(body.procedures);
//       const services = normalizeArray(body.services);
//       const symptoms = normalizeArray(body.symptoms);

//       // Update doctors table
//       const updateSql = `UPDATE doctors SET
//         name = ?, slug = ?, designation = ?, type = ?, short_description = ?, description = ?, seo_title = ?, seo_keywords = ?, seo_description = ?, json_schema = ?, city_id = ?, area_id = ?, status = ?, consultation_fee = ?, rating = ?, phone_1 = ?, phone_2 = ?, email = ?, address = ?, registration_number = ?, degree = ?, experience_years = ?
//         ${imageUrl ? ", image_url = ?" : ""}
//         WHERE id = ?`;

//       const baseParams = [
//         body.name || "",
//         body.slug || null,
//         body.designation || null,
//         body.type || null,
//         body.short_description || null,
//         body.description || null,
//         body.seo_title || null,
//         body.seo_keywords || null,
//         body.seo_description || null,
//         body.json_schema || null,
//         body.city_id ? Number(body.city_id) : null,
//         body.area_id ? Number(body.area_id) : null,
//         body.status || "active",
//         body.consultation_fee ? Number(body.consultation_fee) : 0,
//         body.rating ? Number(body.rating) : 0,
//         body.phone_1 || null,
//         body.phone_2 || null,
//         body.email || null,
//         body.address || null,
//         body.registration_number || null,
//         body.degree || null,
//         body.experience_years ? Number(body.experience_years) : null,
//       ];

//       let params = [];
//       if (imageUrl) {
//         params = [...baseParams, imageUrl, id];
//       } else {
//         params = [...baseParams, id];
//       }

//       await connection.query(updateSql, params);

//       // For mapping tables: simplest approach: delete existing mappings and re-insert
//       const deleteAndInsert = async (deleteSql, insertTable, insertCol, ids) => {
//         await connection.query(deleteSql, [id]);
//         if (!ids || ids.length === 0) return;
//         const values = ids.map((rid) => [id, rid]);
//         const insertSql = `INSERT INTO ${insertTable} (doctor_id, ${insertCol}) VALUES ?`;
//         await connection.query(insertSql, [values]);
//       };

//       await deleteAndInsert(`DELETE FROM doctor_specialization WHERE doctor_id = ?`, "doctor_specialization", "specialization_id", specializations);
//       await deleteAndInsert(`DELETE FROM doctor_clinic WHERE doctor_id = ?`, "doctor_clinic", "clinic_id", clinics);
//       await deleteAndInsert(`DELETE FROM doctor_hospital WHERE doctor_id = ?`, "doctor_hospital", "hospital_id", hospitals);
//       await deleteAndInsert(`DELETE FROM doctor_procedure WHERE doctor_id = ?`, "doctor_procedure", "procedure_id", procedures);
//       await deleteAndInsert(`DELETE FROM doctor_service WHERE doctor_id = ?`, "doctor_service", "service_id", services);
//       await deleteAndInsert(`DELETE FROM doctor_symptom WHERE doctor_id = ?`, "doctor_symptom", "symptom_id", symptoms);

//       await connection.commit();
//       res.json({ ok: true });
//     } catch (err) {
//       await connection.rollback();
//       console.error("❌ updateDoctor Transaction Error:", err);
//       res.status(500).json({ error: "Failed to update doctor" });
//     } finally {
//       connection.release();
//     }
//   } catch (err) {
//     console.error("❌ updateDoctor Connection Error:", err);
//     res.status(500).json({ error: "Server error" });
//   }
// };



export const updateDoctor = async (req, res) => {
  const { id } = req.params;

  try {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1) Fetch existing doctor
      const [[existing]] = await connection.query(
        `SELECT id, image_url, image_key FROM doctors WHERE id = ?`,
        [id]
      );

      if (!existing) {
        await connection.rollback();
        return res.status(404).json({ error: "Doctor not found" });
      }

      const oldImageKey = existing.image_key;

      // 2) Upload new file (if any)
      let newImageUrl = null;
      let newImageKey = null;

      if (req.file) {
        const uploaded = await uploadImageToS3(req.file, "doctors");
        newImageUrl = uploaded.imageUrl;
        newImageKey = uploaded.fileKey;
      }

      // 3) Normalize incoming body arrays
      const body = req.body || {};

      const normalizeArray = (v) => {
        if (!v) return [];
        if (Array.isArray(v)) return v.map(Number).filter(Boolean);

        if (typeof v === "string") {
          return v
            .split(",")
            .map((x) => Number(x.trim()))
            .filter(Boolean);
        }
        return [];
      };

      const specializations = normalizeArray(body.specializations);
      const clinics = normalizeArray(body.clinics);
      const hospitals = normalizeArray(body.hospitals);
      const procedures = normalizeArray(body.procedures);
      const services = normalizeArray(body.services);
      const symptoms = normalizeArray(body.symptoms);

      // 4) Build UPDATE query
      const updateSql = `
        UPDATE doctors SET
          name = ?, slug = ?, designation = ?, short_description = ?, 
          description = ?, seo_title = ?, seo_keywords = ?, 
          seo_description = ?, json_schema = ?, city_id = ?, 
          area_id = ?, status = ?, consultation_fee = ?, rating = ?, 
          phone_1 = ?, phone_2 = ?, email = ?, address = ?, 
          registration_number = ?, degree = ?, experience_years = ?
          ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
        WHERE id = ?
      `;

      const baseParams = [
        body.name || "",
        body.slug || null,
        body.designation || null,
        body.short_description || null,
        body.description || null,
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema || null,
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
      ];

      let updateParams = [];

      if (newImageUrl) {
        updateParams = [...baseParams, newImageUrl, newImageKey, id];
      } else {
        updateParams = [...baseParams, id];
      }

      await connection.query(updateSql, updateParams);

      // 5) Update mapping tables
      const deleteAndInsert = async (deleteSql, table, col, ids) => {
        await connection.query(deleteSql, [id]);
        if (!ids.length) return;

        const values = ids.map((rid) => [id, rid]);
        const insertSql = `INSERT INTO ${table} (doctor_id, ${col}) VALUES ?`;
        await connection.query(insertSql, [values]);
      };

      await deleteAndInsert(
        `DELETE FROM doctor_specialization WHERE doctor_id = ?`,
        "doctor_specialization",
        "specialization_id",
        specializations
      );

      await deleteAndInsert(
        `DELETE FROM doctor_clinic WHERE doctor_id = ?`,
        "doctor_clinic",
        "clinic_id",
        clinics
      );

      await deleteAndInsert(
        `DELETE FROM doctor_hospital WHERE doctor_id = ?`,
        "doctor_hospital",
        "hospital_id",
        hospitals
      );

      await deleteAndInsert(
        `DELETE FROM doctor_procedure WHERE doctor_id = ?`,
        "doctor_procedure",
        "procedure_id",
        procedures
      );

      await deleteAndInsert(
        `DELETE FROM doctor_service WHERE doctor_id = ?`,
        "doctor_service",
        "service_id",
        services
      );

      await deleteAndInsert(
        `DELETE FROM doctor_symptom WHERE doctor_id = ?`,
        "doctor_symptom",
        "symptom_id",
        symptoms
      );

      // 6) Commit
      await connection.commit();

      // 7) Delete old image from S3 AFTER commit
      if (newImageKey && oldImageKey && oldImageKey !== newImageKey) {
        await deleteFromS3(oldImageKey);
      }

      res.json({ ok: true });

    } catch (err) {
      await connection.rollback();
      console.error("❌ updateDoctor Transaction Error:", err);
      res.status(500).json({ error: "Failed to update doctor" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ updateDoctor Connection Error:", err);
    res.status(500).json({ error: "Server error" });
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

