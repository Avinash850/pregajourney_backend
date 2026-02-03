import express from "express";
import upload from "../middleware/upload.js";
import {
  getClinics,
  getClinicById,
  createClinic,
  updateClinic,
  deleteClinic,

  // NEW imports
  getClinicImages,
  uploadClinicImages,
  deleteClinicImage,
} from "../controllers/clinicController.js";

const router = express.Router();

/* ===== EXISTING CLINIC ROUTES (UNCHANGED) ===== */
router.get("/clinics", getClinics);
router.get("/clinics/:id", getClinicById);

router.post("/clinics", upload.single("image"), createClinic);
router.put("/clinics/:id", upload.single("image"), updateClinic);
router.delete("/clinics/:id", deleteClinic);

/* ===== NEW CLINIC GALLERY ROUTES ===== */

// get all gallery images of a clinic
router.get("/clinics/:id/images", getClinicImages);

// upload 1–10 gallery images
router.post(
  "/clinics/:id/images",
  upload.array("images", 10),
  uploadClinicImages
);

// delete single gallery image
router.delete("/clinic-images/:id", deleteClinicImage);

export default router;
