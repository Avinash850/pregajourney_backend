import express from "express";

import migrateDoctorSlugs  from "../controllers/migrations/doctorSlugMigration";

const router = express.Router();

// ⚠️ TEMPORARY — REMOVE AFTER USE
router.post("/migrate/doctor-slugs", migrateDoctorSlugs);

export default router;
