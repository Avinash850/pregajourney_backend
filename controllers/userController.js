import pool from "../db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { sendMail } from "../helpers/sendMail.js"; 

// ===========================
// Helper: Generate JWT Token
// ===========================
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

// ===========================
// REGISTER USER
// ===========================
export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    // Check if user exists
    const [existing] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (existing.length > 0)
      return res.status(409).json({ success: false, message: "Email already registered" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const [result] = await pool.query(
      `INSERT INTO users 
        (name, email, password, status, created_at, created_by) 
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [name, email, hashedPassword, 1, "Admin"]
    );

    // Generate token
    const token = generateToken(result.insertId);

    return res.json({
      success: true,
      message: "User registered successfully",
      token,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Registration failed" });
  }
};


// ===========================
// LOGIN USER
// ===========================
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ success: false, message: "Email & password required" });

    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "User not found" });

    const user = rows[0];

    // Compare hashed password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(401).json({ success: false, message: "Invalid credentials" });

    const token = generateToken(user.id);

    return res.json({
      success: true,
      message: "Login successful",
      token,
      name: user.name,
      email: user.email
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Login failed" });
  }
};

// ===========================
// GET LOGGED-IN USER (Protected)
// ===========================
export const getMe = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name, email FROM users WHERE id = ?", [
      req.user.id,
    ]);

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to fetch user" });
  }
};


// ===========================
// EXISTING CRUD (unchanged)
// ===========================
export const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Database error" });
  }
};

// export const createUser = async (req, res) => {
//   try {
//     const { name, email } = req.body;
//     const [result] = await pool.query(
//       "INSERT INTO users (name, email) VALUES (?, ?)",
//       [name, email]
//     );
//     res.json({ success: true, userId: result.insertId });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, error: "Insert failed" });
//   }
// };

// export const updateUser = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, email } = req.body;
//     await pool.query("UPDATE users SET name=?, email=? WHERE id=?", [
//       name,
//       email,
//       id,
//     ]);
//     res.json({ success: true, message: "User updated" });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ success: false, error: "Update failed" });
//   }
// };

export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM users WHERE id=?", [id]);
    res.json({ success: true, message: "User deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Delete failed" });
  }
};



// Generate 6-digit OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "Email not found" });

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

    // Save OTP in DB
    await pool.query(
      "UPDATE users SET reset_otp = ?, reset_otp_expires = ? WHERE email = ?",
      [otp, expiresAt, email]
    );

    // Send OTP Email
    await sendMail({
      to: email,
      subject: "Your Password Reset OTP",
      template: "forgot-password", // templates/forgot-password.html
      data: { otp }
    });

    return res.json({
      success: true,
      message: "OTP sent to your email.",
    });

  } catch (error) {
    console.error("❌ Forgot Password Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const [rows] = await pool.query(
      "SELECT reset_otp, reset_otp_expires FROM users WHERE email = ?",
      [email]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "Email not found" });

    const { reset_otp, reset_otp_expires } = rows[0];

    if (!reset_otp)
      return res.status(400).json({ success: false, message: "No OTP generated. Please request again." });

    if (reset_otp !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    if (new Date() > new Date(reset_otp_expires))
      return res.status(400).json({ success: false, message: "OTP expired" });

    return res.json({
      success: true,
      message: "OTP verified successfully",
    });

  } catch (error) {
    console.error("❌ Verify OTP Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    const [rows] = await pool.query(
      "SELECT reset_otp, reset_otp_expires FROM users WHERE email = ?",
      [email]
    );

    if (rows.length === 0)
      return res.status(404).json({ success: false, message: "Email not found" });

    const { reset_otp, reset_otp_expires } = rows[0];

    if (reset_otp !== otp)
      return res.status(400).json({ success: false, message: "Invalid OTP" });

    if (new Date() > new Date(reset_otp_expires))
      return res.status(400).json({ success: false, message: "OTP expired" });

    // Hash new password
    const hashed = await bcrypt.hash(newPassword, 10);

    // Update DB
    await pool.query(
      "UPDATE users SET password = ?, reset_otp = NULL, reset_otp_expires = NULL WHERE email = ?",
      [hashed, email]
    );

    return res.json({
      success: true,
      message: "Password reset successful",
    });

  } catch (error) {
    console.error("❌ Reset Password Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};



export const updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await pool.query(
      "UPDATE users SET status = ? WHERE id = ?",
      [status, id]
    );

    res.json({ success: true, message: "Status updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Status update failed" });
  }
};


export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    await pool.query(
      "UPDATE users SET name = ? WHERE id = ?",
      [name, id]
    );

    res.json({ success: true, message: "User updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Update failed" });
  }
};


export const createUser = async (req, res) => {
  try {
    const { name, email } = req.body;

    const [exists] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (exists.length)
      return res.status(409).json({ success: false, message: "Email already exists" });

    await pool.query(
      `INSERT INTO users (name, email, status, created_at, created_by)
       VALUES (?, ?, 1, NOW(), 'Admin')`,
      [name, email]
    );

    res.json({ success: true, message: "User created" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Insert failed" });
  }
};
