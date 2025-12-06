import pool from "../db.js";

// ✅ GET ALL CATEGORIES
export const getCategories = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug, status FROM blog_categories ORDER BY id DESC`
    );

    res.json(rows);
  } catch (error) {
    console.error("❌ getCategories error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ CREATE NEW CATEGORY
export const createCategory = async (req, res) => {
  try {
    const { name, slug } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const finalSlug =
      slug?.trim() ||
      name.toLowerCase().trim().replace(/\s+/g, "-");

    await pool.query(
      `INSERT INTO blog_categories (name, slug, status, created_at, created_by)
       VALUES (?, ?, 1, NOW(), 'admin')`,
      [name.trim(), finalSlug]
    );

    res.json({ message: "Category created successfully" });
  } catch (error) {
    console.error("❌ createCategory error:", error);
    res.status(500).json({ error: "Server error" });
  }
};


// ✅ UPDATE CATEGORY
export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    const finalSlug =
      slug?.trim() ||
      name.toLowerCase().trim().replace(/\s+/g, "-");

    await pool.query(
      `UPDATE blog_categories SET name = ?, slug = ? WHERE id = ?`,
      [name.trim(), finalSlug, id]
    );

    res.json({ message: "Category updated successfully" });
  } catch (error) {
    console.error("❌ updateCategory error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ UPDATE STATUS ONLY (TOGGLE)
export const updateCategoryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (status === undefined) {
      return res.status(400).json({ error: "Status is required" });
    }

    await pool.query(
      `UPDATE blog_categories SET status = ? WHERE id = ?`,
      [status, id]
    );

    res.json({ message: "Status updated" });
  } catch (error) {
    console.error("❌ updateCategoryStatus error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
