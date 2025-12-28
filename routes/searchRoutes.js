import express from "express";
import {  search, suggest , getSearchDetails,searchByIntent, searchDiscover } from "../controllers/searchController.js";

const router = express.Router();

router.get("/search", search);
router.get("/suggest", suggest);
// router.get("/locations/suggest", suggest);
router.get("/search/details", getSearchDetails)
router.get("/search/intent", searchByIntent)
router.get("/search/discover", searchDiscover);


export default router;
