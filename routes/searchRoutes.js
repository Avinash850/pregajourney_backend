import express from "express";
import {  search, suggest , getSearchDetails } from "../controllers/searchController.js";

const router = express.Router();

router.get("/search", search);
router.get("/suggest", suggest);
// router.get("/locations/suggest", suggest);
router.get("/search/details", getSearchDetails)

export default router;
