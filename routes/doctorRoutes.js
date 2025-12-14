import express from "express";
import { getDoctors, getDoctorById, createDoctor, updateDoctor, deleteDoctor,} from "../controllers/doctorController.js";
import upload from "../middleware/upload.js";



const router = express.Router();

// List doctors
router.get("/doctors", getDoctors);

// Create doctor (expects multipart/form-data with optional file in req.file)
// router.post("/doctors", createDoctor);
router.post("/doctors", upload.single("image"), createDoctor);

// Get single doctor with relational arrays
router.get("/doctors/:id", getDoctorById);

// Update doctor (expects multipart/form-data with optional file in req.file)
// router.put("/doctors/:id", updateDoctor);
router.put("/doctors/:id", upload.single("image"), updateDoctor);

// Delete doctor
router.delete("/doctors/:id", deleteDoctor);

export default router;
