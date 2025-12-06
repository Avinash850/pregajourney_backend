import express from "express";
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

// ✅ Create new post
router.post("/posts", createPost);

// ✅ Update post
router.put("/posts/:id", updatePost);

// ✅ Delete post
router.delete("/posts/:id", deletePost);

export default router;
