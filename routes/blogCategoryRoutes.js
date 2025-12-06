import express from "express";
import {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
} from "../controllers/blogCategoryController.js";

const router = express.Router();

// ✅ GET all
router.get("/blog-categories", getCategories);

// ✅ CREATE
router.post("/blog-categories", createCategory);

// ✅ UPDATE
router.put("/blog-categories/:id", updateCategory);

// ✅ STATUS TOGGLE
router.patch("/blog-categories/:id/status", updateCategoryStatus);

export default router;
