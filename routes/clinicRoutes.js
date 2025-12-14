import express from "express";
import upload from "../middleware/upload.js";
import {
  getClinics,
  getClinicById,
  createClinic,
  updateClinic,
  deleteClinic,
} from "../controllers/clinicController.js";

const router = express.Router();

router.get("/clinics", getClinics);
router.get("/clinics/:id", getClinicById);

router.post("/clinics", upload.single("image"), createClinic);
router.put("/clinics/:id", upload.single("image"), updateClinic);
router.delete("/clinics/:id", deleteClinic);

export default router;
