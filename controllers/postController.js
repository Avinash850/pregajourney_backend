import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";

/* =====================================================
   GET ALL POSTS
   ===================================================== */
export const getPosts = async (req, res) => {
  try {
    const [posts] = await pool.query(`
      SELECT
        id, name, slug, short_description, description,
        seo_title, seo_keywords, seo_description,
        json_schema, image_url, image_key, status, created_at
      FROM posts
      ORDER BY id DESC
    `);

    if (!posts.length) return res.json([]);

    const postIds = posts.map(p => p.id);

    const [categories] = await pool.query(
      `SELECT post_id, category_id FROM post_categories WHERE post_id IN (?)`,
      [postIds]
    );

    const response = posts.map(p => ({
      ...p,
      categories: categories
        .filter(c => c.post_id === p.id)
        .map(c => c.category_id)
    }));

    res.json(response);
  } catch (err) {
    console.error("❌ getPosts Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/* =====================================================
   GET POST BY ID
   ===================================================== */
export const getPostById = async (req, res) => {
  const { id } = req.params;
  try {
    const [[post]] = await pool.query(`SELECT * FROM posts WHERE id = ?`, [id]);

    if (!post) return res.status(404).json({ error: "Post not found" });

    const [categories] = await pool.query(
      `SELECT category_id AS id FROM post_categories WHERE post_id = ?`,
      [id]
    );

    res.json({ ...post, categories });
  } catch (err) {
    console.error("❌ getPostById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};

/* =====================================================
   CREATE POST
   ===================================================== */
export const createPost = async (req, res) => {
  try {
    let imageUrl = null;
    let imageKey = null;

    if (req.file) {
      const up = await uploadImageToS3(req.file, "posts");
      imageUrl = up.imageUrl;
      imageKey = up.fileKey;
    }

    const body = req.body || {};

    const normalizeArray = (v) => {
      if (!v) return [];
      if (Array.isArray(v)) return v.map(Number).filter(Boolean);
      if (typeof v === "string") return v.split(",").map(x => Number(x.trim())).filter(Boolean);
      return [];
    };

    const categories = normalizeArray(body.categories);

    const [result] = await pool.query(
      `INSERT INTO posts
        (name, slug, short_description, description, seo_title, seo_keywords, seo_description,
         json_schema, image_url, image_key, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.name || "",
        body.slug || "",
        body.short_description || null,
        body.description || null,
        body.seo_title || null,
        body.seo_keywords || null,
        body.seo_description || null,
        body.json_schema ? JSON.stringify(body.json_schema) : null,
        imageUrl,
        imageKey,
        body.status || "active"
      ]
    );

    const postId = result.insertId;

    if (categories.length) {
      const values = categories.map(c => [postId, c]);
      await pool.query(`INSERT INTO post_categories (post_id, category_id) VALUES ?`, [values]);
    }

    res.status(201).json({ id: postId });
  } catch (err) {
    console.error("❌ createPost Error:", err);
    res.status(500).json({ error: "Failed to create post" });
  }
};

/* =====================================================
   UPDATE POST
   ===================================================== */
export const updatePost = async (req, res) => {
  const { id } = req.params;
  try {
    const [[existing]] = await pool.query(`SELECT image_key FROM posts WHERE id = ?`, [id]);
    if (!existing) return res.status(404).json({ error: "Post not found" });

    const oldKey = existing.image_key;

    let newImageUrl = null;
    let newImageKey = null;
    if (req.file) {
      const up = await uploadImageToS3(req.file, "posts");
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
    const categories = normalizeArray(body.categories);

    const updateSql = `
      UPDATE posts SET
        name = ?, slug = ?, short_description = ?, description = ?,
        seo_title = ?, seo_keywords = ?, seo_description = ?,
        json_schema = ?, status = ? ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
      WHERE id = ?
    `;

    const baseParams = [
      body.name || "",
      body.slug || "",
      body.short_description || null,
      body.description || null,
      body.seo_title || null,
      body.seo_keywords || null,
      body.seo_description || null,
      body.json_schema ? JSON.stringify(body.json_schema) : null,
      body.status || "active"
    ];

    const params = newImageUrl ? [...baseParams, newImageUrl, newImageKey, id] : [...baseParams, id];

    await pool.query(updateSql, params);

    // Update categories
    await pool.query(`DELETE FROM post_categories WHERE post_id = ?`, [id]);
    if (categories.length) {
      const values = categories.map(c => [id, c]);
      await pool.query(`INSERT INTO post_categories (post_id, category_id) VALUES ?`, [values]);
    }

    if (newImageKey && oldKey && oldKey !== newImageKey) {
      await deleteFromS3(oldKey);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ updatePost Error:", err);
    res.status(500).json({ error: "Failed to update post" });
  }
};

/* =====================================================
   DELETE POST
   ===================================================== */
export const deletePost = async (req, res) => {
  const { id } = req.params;
  try {
    const [[post]] = await pool.query(`SELECT image_key FROM posts WHERE id = ?`, [id]);
    if (!post) return res.status(404).json({ error: "Post not found" });

    await pool.query(`DELETE FROM post_categories WHERE post_id = ?`, [id]);
    await pool.query(`DELETE FROM posts WHERE id = ?`, [id]);

    if (post.image_key) await deleteFromS3(post.image_key);

    res.json({ ok: true });
  } catch (err) {
    console.error("❌ deletePost Error:", err);
    res.status(500).json({ error: "Failed to delete post" });
  }
};
