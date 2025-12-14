import pool from "../db.js";
import { sendMail } from "../helpers/sendMail.js";

export const getEnquiries = async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT id, name, email, phone, service, message, created_at 
       FROM enquiries 
       ORDER BY id DESC`
        );

        res.json(rows);
    } catch (error) {
        console.error("❌ getEnquiries Error:", error);
        res.status(500).json({ error: "Server error" });
    }
};


export const getEnquiryById = async (req, res) => {
    try {
        const id = req.params.id;

        const [rows] = await pool.query(
            "SELECT * FROM enquiries WHERE id = ?",
            [id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Enquiry not found" });
        }

        res.json(rows[0]);
    } catch (error) {
        console.error("❌ getEnquiryById Error:", error);
        res.status(500).
            json({ error: "Server error" });
    }
};




export const createEnquiry = async (req, res) => {
  try {
    const { name, mobile, city, service, message, email } = req.body;

    // Basic validation
    if (!name || !mobile || !service) {
      return res.status(400).json({
        success: false,
        message: "Name, mobile, and service are required fields.",
      });
    }

    // Insert into DB
    const [result] = await pool.query(
      `INSERT INTO enquiries (name, phone, email, city, service, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [name, mobile, email || null, city || null, service, message || null]
    );

    const enquiryId = result.insertId;

    // ---------------------------------------
    //  📧 SEND EMAIL TO ADMIN
    // ---------------------------------------

    const adminEmail = process.env.ADMIN_EMAIL; // <-- from .env

    await sendMail({
      to: adminEmail,
      cc: "avinashkumarnke12@gmail.com",
      subject: `New Enquiry Received (#${enquiryId})`,
      template: "enquiry",        // templates/enquiry.html
      data: {
        name,
        mobile,
        email: email || "N/A",
        city: city || "N/A",
        service,
        message: message || "No message provided",
        enquiryId
      }
    });

    // ---------------------------------------
    //  OPTIONAL: SEND CONFIRMATION TO USER
    // ---------------------------------------

    if (email) {
      await sendMail({
        to: email,
        subject: "Thank you for contacting us!",
        template: "user-confirmation",
        data: {
          name,
          service
        }
      });
    }

    // ---------------------------------------
    //  FINAL RESPONSE
    // ---------------------------------------

    res.json({
      success: true,
      message: "Enquiry submitted successfully!",
      enquiryId,
    });

  } catch (error) {
    console.error("❌ createEnquiry Error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while submitting enquiry.",
    });
  }
};


