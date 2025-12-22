import pool from "../db.js";

// -----------------------
// Public Blog Categories
// -----------------------
export const getBlogCategories = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, slug
            FROM blog_categories
            WHERE status = 1
            ORDER BY name ASC
        `);

        res.json(rows);
    } catch (error) {
        console.error("❌ getBlogCategories Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Public Blog Listing
// -----------------------
export const getBlogs = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const categorySlug = req.query.category || null;

        const offset = (page - 1) * limit;

        let countQuery = `
            SELECT COUNT(DISTINCT p.id) AS total
            FROM posts p
            LEFT JOIN post_categories pc ON pc.post_id = p.id
            LEFT JOIN blog_categories c ON c.id = pc.category_id
            WHERE p.status = 'active'
        `;

        let dataQuery = `
            SELECT DISTINCT
                p.id,
                p.name,
                p.slug,
                p.short_description,
                p.image_url,
                p.created_at
            FROM posts p
            LEFT JOIN post_categories pc ON pc.post_id = p.id
            LEFT JOIN blog_categories c ON c.id = pc.category_id
            WHERE p.status = 'active'
        `;

        const params = [];

        if (categorySlug) {
            countQuery += ` AND c.slug = ?`;
            dataQuery += ` AND c.slug = ?`;
            params.push(categorySlug);
        }

        dataQuery += `
            ORDER BY p.created_at DESC
            LIMIT ? OFFSET ?
        `;

        const [countResult] = await pool.query(countQuery, params);
        const total = countResult[0]?.total || 0;
        const totalPages = Math.ceil(total / limit);

        const [blogs] = await pool.query(
            dataQuery,
            [...params, limit, offset]
        );

        res.json({
            data: blogs,
            pagination: {
                page,
                limit,
                total,
                totalPages
            }
        });
    } catch (error) {
        console.error("❌ getBlogs Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};


export const getBlogDetail = async (req, res) => {
    try {
        const { slug } = req.params;

        const [rows] = await pool.query(
            `
            SELECT *
            FROM posts p
            WHERE p.slug = ?
              AND p.status = 'active'
            LIMIT 1
            `,
            [slug]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: "Blog not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("❌ getBlogDetail Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};


export const getRelatedBlogs = async (req, res) => {
    try {
        const categorySlug = req.query.category || null;
        const excludeSlug = req.query.exclude || null;
        const limit = parseInt(req.query.limit) || 4;

        let blogs = [];

        // 1️⃣ Same category blogs
        if (categorySlug) {
            const [categoryBlogs] = await pool.query(
                `
                SELECT DISTINCT
                    p.id,
                    p.name,
                    p.slug,
                    p.short_description,
                    p.image_url,
                    p.created_at
                FROM posts p
                LEFT JOIN post_categories pc ON pc.post_id = p.id
                LEFT JOIN blog_categories c ON c.id = pc.category_id
                WHERE p.status = 'active'
                  AND c.slug = ?
                  AND p.slug != ?
                ORDER BY p.created_at DESC
                LIMIT ?
                `,
                [categorySlug, excludeSlug, limit]
            );

            blogs = categoryBlogs;
        }

        // 2️⃣ Fallback to latest blogs
        if (blogs.length < limit) {
            const remaining = limit - blogs.length;
            const existingIds = blogs.map(b => b.id);

            const [latestBlogs] = await pool.query(
                `
                SELECT
                    p.id,
                    p.name,
                    p.slug,
                    p.short_description,
                    p.image_url,
                    p.created_at
                FROM posts p
                WHERE p.status = 'active'
                  AND p.slug != ?
                  ${existingIds.length ? `AND p.id NOT IN (${existingIds.map(() => '?').join(",")})` : ""}
                ORDER BY p.created_at DESC
                LIMIT ?
                `,
                [...existingIds, excludeSlug, remaining].filter(Boolean)
            );

            blogs = [...blogs, ...latestBlogs];
        }

        res.json(blogs);
    } catch (error) {
        console.error("❌ getRelatedBlogs Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};
