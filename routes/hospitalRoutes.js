import express from "express";
import upload from "../middleware/upload.js";
import {
  getHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  deleteHospital,
} from "../controllers/hospitalController.js";

const router = express.Router();

router.get("/hospitals", getHospitals);
router.get("/hospitals/:id", getHospitalById);

router.post("/hospitals", upload.single("image"), createHospital);
router.put("/hospitals/:id", upload.single("image"), updateHospital);
router.delete("/hospitals/:id", deleteHospital);

export default router;
