import express from "express";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import blogRoutes from "./routes/blogRoutes.js";
import blogCategoryRoutes from "./routes/blogCategoryRoutes.js";
import enquiryRoutes from "./routes/enquiryRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import cors from 'cors'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8001;

app.use(express.json());
app.use(cors())

// Routes
app.use("/api/users", userRoutes);
app.use("/api", searchRoutes);
app.use("/api", locationRoutes);
app.use("/api", blogRoutes);
app.use("/api", blogCategoryRoutes);
app.use("/api", enquiryRoutes);
app.use("/api", postRoutes);
app.use("/uploads", express.static("uploads"));

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
