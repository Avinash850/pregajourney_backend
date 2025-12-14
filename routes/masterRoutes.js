import express from "express";
import {
    getSpecializations,
    getClinics,
    getHospitals,
    getProcedures,
    getServices,
    getSymptoms,
    getCities,
    getAreas,
    getDoctors
} from "../controllers/masterController.js";

const router = express.Router();

// Masters GET APIs
router.get("/specializations", getSpecializations);
router.get("/clinics", getClinics);
router.get("/hospitals", getHospitals);
router.get("/procedures", getProcedures);
router.get("/services", getServices);
router.get("/symptoms", getSymptoms);
router.get("/cities", getCities);
router.get("/areas", getAreas);
router.get("/doctors", getDoctors);

export default router;
