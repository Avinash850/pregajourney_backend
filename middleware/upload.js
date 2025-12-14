// backend/middleware/upload.js
import multer from "multer";

const storage = multer.memoryStorage(); // keeps file in RAM for S3 upload
const upload = multer({ storage });

export default upload;
