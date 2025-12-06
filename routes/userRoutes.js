import express from "express";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../controllers/userController.js";

const router = express.Router();

router.get("/", getUsers);          // GET all users
router.post("/", createUser);       // Add user
router.put("/:id", updateUser);     // Update user by ID
router.delete("/:id", deleteUser);  // Delete user by ID

export default router;
