// import pool from "../../db.js";

// // simple slugify helper
// const slugify = (text) =>
//   text
//     .toLowerCase()
//     .trim()
//     .replace(/[^a-z0-9\s-]/g, "")
//     .replace(/\s+/g, "-")
//     .replace(/-+/g, "-");

// export const migrateDoctorSlugs = async (req, res) => {
//   const connection = await pool.getConnection();

//   try {
//     await connection.beginTransaction();

//     // 1️⃣ Fetch doctors with primary specialization
//     const [doctors] = await connection.query(`
//       SELECT 
//         d.id,
//         d.name AS doctor_name,
//         s.name AS specialization_name
//       FROM doctors d
//       LEFT JOIN doctor_specialization ds 
//         ON ds.doctor_id = d.id AND ds.is_primary = 1
//       LEFT JOIN specializations s 
//         ON s.id = ds.specialization_id
//       ORDER BY d.id ASC
//     `);

//     for (const doc of doctors) {
//       let baseSlug = `dr-${doc.doctor_name}`;
//       if (doc.specialization_name) {
//         baseSlug += `-${doc.specialization_name}`;
//       }

//       baseSlug = slugify(baseSlug);

//       let finalSlug = baseSlug;
//       let counter = 1;

//       // 2️⃣ Ensure uniqueness
//       while (true) {
//         const [[exists]] = await connection.query(
//           `SELECT id FROM doctors WHERE slug = ?`,
//           [finalSlug]
//         );

//         if (!exists) break;

//         finalSlug = `${baseSlug}-${counter}`;
//         counter++;
//       }

//       // 3️⃣ Update doctor
//       await connection.query(
//         `UPDATE doctors SET slug = ? WHERE id = ?`,
//         [finalSlug, doc.id]
//       );
//     }

//     await connection.commit();

//     res.json({
//       ok: true,
//       message: "Doctor slug migration completed successfully",
//       total: doctors.length,
//     });

//   } catch (err) {
//     await connection.rollback();
//     console.error("❌ Doctor slug migration failed:", err);
//     res.status(500).json({ error: "Migration failed" });
//   } finally {
//     connection.release();
//   }
// };




import pool from "../../db.js";

// simple slugify helper
const slugify = (text) =>
  text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const migrateDoctorSlugs = async (req, res) => {
  try {
    // 1️⃣ Fetch doctors with primary specialization
    const [doctors] = await pool.query(`
      SELECT 
        d.id,
        d.name AS doctor_name,
        s.name AS specialization_name
      FROM doctors d
      LEFT JOIN doctor_specialization ds 
        ON ds.doctor_id = d.id AND ds.is_primary = 1
      LEFT JOIN specializations s 
        ON s.id = ds.specialization_id
      ORDER BY d.id ASC
    `);

    for (const doc of doctors) {
      let baseSlug = `dr-${doc.doctor_name}`;
      if (doc.specialization_name) {
        baseSlug += `-${doc.specialization_name}`;
      }

      baseSlug = slugify(baseSlug);

      let finalSlug = baseSlug;
      let counter = 1;

      // 2️⃣ Ensure uniqueness
      while (true) {
        const [[exists]] = await pool.query(
          `SELECT id FROM doctors WHERE slug = ?`,
          [finalSlug]
        );

        if (!exists) break;

        finalSlug = `${baseSlug}-${counter}`;
        counter++;
      }

      // 3️⃣ Update doctor
      await pool.query(`UPDATE doctors SET slug = ? WHERE id = ?`, [finalSlug, doc.id]);
    }

    res.json({
      ok: true,
      message: "Doctor slug migration completed successfully",
      total: doctors.length,
    });

  } catch (err) {
    console.error("❌ Doctor slug migration failed:", err);
    res.status(500).json({ error: "Migration failed" });
  }
};

