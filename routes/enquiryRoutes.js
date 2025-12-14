import express from "express";
import { getEnquiries, getEnquiryById, createEnquiry} from "../controllers/enquiryController.js";

const router = express.Router();

router.post("/enquiries", createEnquiry);

router.get("/enquiries", getEnquiries);

router.get("/enquiries/:id", getEnquiryById);

export default router;
