import express from "express";
import { getAllBlogs, uploadBlogImage, upload } from "../controllers/blogController.js";

const router = express.Router();

// GET all active blogs
router.get("/blogs", getAllBlogs);

// POST upload new blog image
router.post("/blogs/:id/upload", upload.single("image"), uploadBlogImage);

export default router;
