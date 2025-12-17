import express from "express";
import upload from "../middleware/upload.js";
import {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
} from "../controllers/postController.js";

const router = express.Router();

// ✅ Get all posts
router.get("/posts", getPosts);

// ✅ Get single post
router.get("/posts/:id", getPostById);

// ✅ Create new post (with image upload)
router.post("/posts", upload.single("image"), createPost);

// ✅ Update post (with image upload)
router.put("/posts/:id", upload.single("image"), updatePost);

// ✅ Delete post
router.delete("/posts/:id", deletePost);

export default router;
