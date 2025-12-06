import express from "express";
import { getEnquiries, getEnquiryById } from "../controllers/enquiryController.js";

const router = express.Router();

// ✅ Get all enquiries
router.get("/enquiries", getEnquiries);

// ✅ Get single enquiry
router.get("/enquiries/:id", getEnquiryById);

export default router;
