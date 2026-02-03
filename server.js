import express from "express";
import dotenv from "dotenv";
import userRoutes from "./routes/userRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import locationRoutes from "./routes/locationRoutes.js";
import publicBlogRoutes from "./routes/publicBlogRoutes.js";
import blogCategoryRoutes from "./routes/blogCategoryRoutes.js";
import enquiryRoutes from "./routes/enquiryRoutes.js";
import postRoutes from "./routes/postRoutes.js";
import masterRoutes from "./routes/masterRoutes.js";
import doctorRoutes from "./routes/doctorRoutes.js";
import hospitalRoutes from "./routes/hospitalRoutes.js";
import clinicRoutes from "./routes/clinicRoutes.js";
// import doctorPageRoutes from "./routes/doctorPageRoutes.js";
// import hospitalPageRoutes from "./routes/hospitalPageRoutes.js";
// import clinicPageRoutes from "./routes/clinicPageRoutes.js";
// import listingPageRoutes from "./routes/listingPageRoutes.js";
import path from "path";
import cors from 'cors'
// import migrationRoutes from "./controllers/migrations/doctorSlugMigration.js";
// import { migrateDoctorSlugs } from "./controllers/migrations/doctorSlugMigration.js";


dotenv.config();

const app = express();
const PORT = process.env.PORT || 8001;

app.use(express.json());
app.use(cors())

// Routes
app.use("/api/users", userRoutes);
app.use("/api", searchRoutes);
app.use("/api", locationRoutes);
app.use("/api/public", publicBlogRoutes);
app.use("/api", blogCategoryRoutes);
app.use("/api", enquiryRoutes);
app.use("/api", postRoutes);
app.use("/api", doctorRoutes);
app.use("/api", hospitalRoutes);
app.use("/api", clinicRoutes);
// app.use("/api", migrateDoctorSlugs);
app.use("/api/masters", masterRoutes);

// =====================
// 2️⃣ SEO PAGE ROUTES (VERY IMPORTANT)
// =====================
// app.use("/", listingPageRoutes);
// app.use("/", doctorPageRoutes);
// app.use("/", hospitalPageRoutes);
// app.use("/", clinicPageRoutes);


app.use("/uploads", express.static("uploads"));

// app.use(express.static(path.resolve("frontend/dist")));

// app.use((req, res) => {
//   res.sendFile(path.resolve("frontend/dist/index.html"));
// });

app.use("/assets", express.static("/var/www/pregajourney/frontend/assets"));
app.use(express.static("/var/www/pregajourney/frontend"));

app.use((req, res) => {
  res.sendFile("/var/www/pregajourney/frontend/index.html");
});


app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
