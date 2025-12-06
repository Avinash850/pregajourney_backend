// routes/locationRoutes.js
import express from "express";
import { suggestLocations } from "../controllers/locationController.js";

const router = express.Router();

router.get("/locations/suggest", suggestLocations);

export default router;
