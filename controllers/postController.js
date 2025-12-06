import pool from "../db.js";

// ✅ GET ALL POSTS
export const getPosts = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id,
        name,
        slug,
        short_description,
        description,
        seo_title,
        seo_keywords,
        seo_description,
        json_schema,
        image,
        category_id,
        status,
        created_at
      FROM posts
      ORDER BY id DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("❌ getPosts Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ GET SINGLE POST BY ID
export const getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query("SELECT * FROM posts WHERE id = ?", [id]);
    if (rows.length === 0)
      return res.status(404).json({ error: "Post not found" });
    res.json(rows[0]);
  } catch (error) {
    console.error("❌ getPostById Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ CREATE NEW POST
export const createPost = async (req, res) => {
  try {
    const {
      name,
      slug,
      short_description,
      description,
      seo_title,
      seo_keywords,
      seo_description,
      json_schema,
      image,
      category_id,
      status,
    } = req.body;

    const [result] = await pool.query(
      `INSERT INTO posts 
        (name, slug, short_description, description, seo_title, seo_keywords, seo_description, json_schema, image, category_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        name || "",
        slug || "",
        short_description || "",
        description || "",
        seo_title || "",
        seo_keywords || "",
        seo_description || "",
        json_schema || "",
        image || "",
        category_id ?? null,
        status ?? 1,
      ]
    );

    res.json({ success: true, message: "Post created successfully", id: result.insertId });
  } catch (error) {
    console.error("❌ createPost Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ UPDATE POST
export const updatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      slug,
      short_description,
      description,
      seo_title,
      seo_keywords,
      seo_description,
      json_schema,
      image,
      category_id,
      status,
    } = req.body;

    await pool.query(
        `UPDATE posts SET
            name = ?,
            slug = ?,
            short_description = ?,
            description = ?,
            seo_title = ?,
            seo_keywords = ?,
            seo_description = ?,
            json_schema = ?,
            image = ?,
            category_id = ?,
            status = ?
        WHERE id = ?`,
        [
            name || "",
            slug || "",
            short_description || "",
            description || "",
            seo_title || "",
            seo_keywords || "",
            seo_description || "",
            JSON.stringify(req.body.json_schema || {}), // ✅ this line changed
            image || "",
            category_id ?? null,
            status ?? 1,
            id,
        ]
    );


    res.json({ success: true, message: "Post updated successfully" });
  } catch (error) {
    console.error("❌ updatePost Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};

// ✅ DELETE POST
export const deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM posts WHERE id = ?", [id]);
    res.json({ success: true, message: "Post deleted successfully" });
  } catch (error) {
    console.error("❌ deletePost Error:", error);
    res.status(500).json({ error: "Server error" });
  }
};
