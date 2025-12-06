import pool from "../db.js";

// ✅ GET ALL ENQUIRIES — SAME AS BLOG CATEGORY
export const getEnquiries = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, phone, service, message, created_at 
       FROM enquiries 
       ORDER BY id DESC`
    );

    res.json(rows); // ✅ SAME as blog category → returns array
  } catch (error) {
    console.error("❌ getEnquiries Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};


// ✅ GET one enquiry by ID
export const getEnquiryById = async (req, res) => {
  try {
    const id = req.params.id;

    const [rows] = await pool.query(
      "SELECT * FROM enquiries WHERE id = ?",
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Enquiry not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("❌ getEnquiryById Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
