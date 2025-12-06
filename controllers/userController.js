import pool from "../db.js";

// GET all users
export const getUsers = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM users");
    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Database error" });
  }
};

// CREATE new user
export const createUser = async (req, res) => {
  try {
    const { name, email } = req.body;
    const [result] = await pool.query(
      "INSERT INTO users (name, email) VALUES (?, ?)",
      [name, email]
    );
    res.json({ success: true, userId: result.insertId });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Insert failed" });
  }
};

// UPDATE user
export const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;
    await pool.query("UPDATE users SET name=?, email=? WHERE id=?", [
      name,
      email,
      id,
    ]);
    res.json({ success: true, message: "User updated" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: "Update failed" });
  }
};

// DELETE user
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
