import express from "express";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  registerUser,
  loginUser,
  forgotPassword,
  verifyOtp,
  resetPassword,
  getMe,
  updateUserStatus 
} from "../controllers/userController.js";

import authMiddleware from "../helpers/authMiddleware.js";

const router = express.Router();

// ----- AUTH ROUTES -----
router.post("/register", registerUser);
router.post("/login", loginUser);

// 🔥 Forgot Password flow
router.post("/forgot-password", forgotPassword);   // Step 1: Send OTP
router.post("/verify-otp", verifyOtp);             // Step 2: Verify OTP
router.post("/reset-password", resetPassword);     // Step 3: Reset Password

router.get("/me", authMiddleware, getMe);

// ----- EXISTING CRUD ROUTES -----
router.get("/", getUsers);
router.post("/", createUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);
router.patch("/:id/status", updateUserStatus);


export default router;
