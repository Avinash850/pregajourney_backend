import pool from "../db.js";

// -----------------------
// Specializations
// -----------------------
export const getSpecializations = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name FROM specializations ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getSpecializations Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Clinics
// -----------------------
export const getClinics = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, address FROM clinics ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getClinics Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Hospitals
// -----------------------
export const getHospitals = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, address FROM hospitals ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getHospitals Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Procedures
// -----------------------
export const getProcedures = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name FROM procedures ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getProcedures Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Services
// -----------------------
export const getServices = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name FROM services ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getServices Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Symptoms
// -----------------------
export const getSymptoms = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name FROM symptoms ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getSymptoms Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Cities
// -----------------------
export const getCities = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name FROM cities ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getCities Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Areas
// -----------------------
export const getAreas = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, city_id, name FROM areas ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getAreas Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};

// -----------------------
// Doctors
// -----------------------
export const getDoctors = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, address FROM doctors ORDER BY name ASC`
        );
        res.json(rows);
    } catch (error) {
        console.error("❌ getHospitals Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};