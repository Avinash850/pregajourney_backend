import express from "express";
import {
    getBlogs,
    getBlogCategories,
    getBlogDetail,
    getRelatedBlogs
} from "../controllers/publicBlogController.js";

const router = express.Router();

router.get("/blogs", getBlogs);
router.get("/blog-categories", getBlogCategories);
router.get("/blogs/related", getRelatedBlogs);
router.get("/blogs/:slug", getBlogDetail);

export default router;
