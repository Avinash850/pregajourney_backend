import express from "express";
import {  search, suggest , getSearchDetails,searchByIntent } from "../controllers/searchController.js";

const router = express.Router();

router.get("/search", search);
router.get("/suggest", suggest);
// router.get("/locations/suggest", suggest);
router.get("/search/details", getSearchDetails)
router.get("/search/intent", searchByIntent)

export default router;
