import pool from "../db.js";
import uploadImageToS3 from "../helpers/uploadToS3.js";
import deleteFromS3 from "../helpers/deleteFromS3.js";


export const getPosts = async (req, res) => {
  try {
    const [posts] = await pool.query(`
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
        image_url,
        image_key,
        status,
        created_at
      FROM posts
      ORDER BY id DESC
    `);

    if (!posts.length) return res.json([]);

    const postIds = posts.map(p => p.id);

    const [categories] = await pool.query(
      `SELECT post_id, category_id
       FROM post_categories
       WHERE post_id IN (?)`,
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


export const getPostById = async (req, res) => {
  const { id } = req.params;
  try {
    const [[post]] = await pool.query(
      `SELECT * FROM posts WHERE id = ?`,
      [id]
    );

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const [categories] = await pool.query(
      `SELECT category_id AS id
       FROM post_categories
       WHERE post_id = ?`,
      [id]
    );

    res.json({
      ...post,
      categories
    });
  } catch (err) {
    console.error("❌ getPostById Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


export const createPost = async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // upload image
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
        if (typeof v === "string")
          return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        return [];
      };

      const categories = normalizeArray(body.categories);

      const [result] = await connection.query(
        `INSERT INTO posts
        (name, slug, short_description, description, seo_title, seo_keywords, seo_description, json_schema, image_url, image_key, status)
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
        await connection.query(
          `INSERT INTO post_categories (post_id, category_id) VALUES ?`,
          [values]
        );
      }

      await connection.commit();
      res.status(201).json({ id: postId });

    } catch (err) {
      await connection.rollback();
      console.error("❌ createPost Error:", err);
      res.status(500).json({ error: "Failed to create post" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ createPost Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


export const updatePost = async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[existing]] = await connection.query(
        `SELECT image_key FROM posts WHERE id = ?`,
        [id]
      );

      if (!existing) {
        await connection.rollback();
        return res.status(404).json({ error: "Post not found" });
      }

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
        if (typeof v === "string")
          return v.split(",").map(x => Number(x.trim())).filter(Boolean);
        return [];
      };

      const categories = normalizeArray(body.categories);

      const updateSql = `
        UPDATE posts SET
          name = ?, slug = ?, short_description = ?, description = ?,
          seo_title = ?, seo_keywords = ?, seo_description = ?,
          json_schema = ?, status = ?
          ${newImageUrl ? ", image_url = ?, image_key = ?" : ""}
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
        body.status || "active",
      ];

      const params = newImageUrl
        ? [...baseParams, newImageUrl, newImageKey, id]
        : [...baseParams, id];

      await connection.query(updateSql, params);

      await connection.query(
        `DELETE FROM post_categories WHERE post_id = ?`,
        [id]
      );

      if (categories.length) {
        const values = categories.map(c => [id, c]);
        await connection.query(
          `INSERT INTO post_categories (post_id, category_id) VALUES ?`,
          [values]
        );
      }

      await connection.commit();

      if (newImageKey && oldKey && oldKey !== newImageKey) {
        await deleteFromS3(oldKey);
      }

      res.json({ ok: true });

    } catch (err) {
      await connection.rollback();
      console.error("❌ updatePost Error:", err);
      res.status(500).json({ error: "Failed to update post" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ updatePost Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};


export const deletePost = async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [[post]] = await connection.query(
        `SELECT image_key FROM posts WHERE id = ?`,
        [id]
      );

      if (!post) {
        await connection.rollback();
        return res.status(404).json({ error: "Post not found" });
      }

      await connection.query(`DELETE FROM post_categories WHERE post_id = ?`, [id]);
      await connection.query(`DELETE FROM posts WHERE id = ?`, [id]);

      await connection.commit();

      if (post.image_key) {
        await deleteFromS3(post.image_key);
      }

      res.json({ ok: true });

    } catch (err) {
      await connection.rollback();
      console.error("❌ deletePost Error:", err);
      res.status(500).json({ error: "Failed to delete post" });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error("❌ deletePost Connection Error:", err);
    res.status(500).json({ error: "Server error" });
  }
};
