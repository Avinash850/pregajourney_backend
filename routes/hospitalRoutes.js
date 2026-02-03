import express from "express";
import upload from "../middleware/upload.js";
import {
  getHospitals,
  getHospitalById,
  createHospital,
  updateHospital,
  deleteHospital,

  // gallery controllers
  getHospitalImages,
  uploadHospitalImages,
  deleteHospitalImage,
} from "../controllers/hospitalController.js";

const router = express.Router();

/* ---------------- HOSPITAL ---------------- */
router.get("/hospitals", getHospitals);
router.get("/hospitals/:id", getHospitalById);

router.post("/hospitals", upload.single("image"), createHospital);
router.put("/hospitals/:id", upload.single("image"), updateHospital);
router.delete("/hospitals/:id", deleteHospital);

/* ---------------- HOSPITAL GALLERY ---------------- */

// get gallery images
router.get("/hospitals/:id/images", getHospitalImages);

// upload gallery images (MULTIPLE)
router.post(
  "/hospitals/:id/images",
  upload.array("images", 10),
  uploadHospitalImages
);

// delete single gallery image
router.delete(
  "/hospital-images/:imageId",
  deleteHospitalImage
);

export default router;
