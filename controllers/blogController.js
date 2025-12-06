import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import db from "../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// ===== Multer setup for image uploads =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const blogId = req.params.id;
    const uploadPath = `uploads/blogs/${blogId}/`;
    fs.mkdirSync(uploadPath, { recursive: true }); // auto create folder if not exists
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = Date.now() + ext; // unique filename
    cb(null, filename);
  },
});

export const upload = multer({ storage: storage });


// ===== Get all blogs (status = 1) with section details =====
export const getAllBlogs = async (req, res) => {
  try {
    // Query to fetch blogs with their respective section data
    const query = `
      SELECT blogs.*, blog_sections.title AS section_title, blog_sections.is_slider 
      FROM blogs
      JOIN blog_sections ON blogs.section_id = blog_sections.id
      WHERE blogs.status = 1 AND blog_sections.status = 1
    `;
    
    const [rows] = await db.query(query);

    // Group blogs by section_id
    const groupedBlogs = rows.reduce((acc, blog) => {
      // Create the section if it doesn't exist
      if (!acc[blog.section_id]) {
        acc[blog.section_id] = {
          title: blog.section_title,
          isSlider: blog.is_slider === 1, // Convert is_slider to boolean
          blogs: [],
        };
      }
      // Add the blog to its respective section
      acc[blog.section_id].blogs.push({
        id: blog.id,
        title: blog.title,
        description: blog.description,
        image_url: blog.image_url
          ? `${req.protocol}://${req.get("host")}/uploads/blogs/${blog.id}/${blog.image_url}`
          : null,
        url: blog.url,
      });
      return acc;
    }, {});

    // Convert the grouped blogs object into an array for easier frontend use
    const formattedSections = Object.values(groupedBlogs);

    res.json({ success: true, data: formattedSections });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};




// ===== Function to delete old images (keeping only the last 2) =====
const deleteOldImages = (blogId) => {
  const folderPath = path.join(__dirname, "../uploads/blogs", blogId.toString());
  console.log("Resolved folder path:", folderPath);

  fs.access(folderPath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error(`Folder does not exist: ${folderPath}`);
      return;
    }

    fs.readdir(folderPath, (err, files) => {
      if (err) {
        console.error("Error reading folder:", err);
        return;
      }

      const imageFiles = files.filter((file) => /\.(jpg|jpeg|png|gif)$/i.test(file));

      imageFiles.sort((a, b) => {
        return fs.statSync(path.join(folderPath, b)).mtimeMs - fs.statSync(path.join(folderPath, a)).mtimeMs;
      });

      const filesToDelete = imageFiles.slice(2);

      filesToDelete.forEach((file) => {
        const filePath = path.join(folderPath, file);
        fs.unlink(filePath, (err) => {
          if (err) console.error(`Error deleting file ${file}:`, err);
          else console.log(`Deleted old image: ${file}`);
        });
      });
    });
  });
};




// ===== Upload image for a blog =====
export const uploadBlogImage = async (req, res) => {
  try {
    const blogId = req.params.id;
    const filename = req.file.filename;

    // update image name in DB
    await db.query("UPDATE blogs SET image_url = ? WHERE id = ?", [filename, blogId]);

    // Delete old images, keeping only the latest two
    deleteOldImages(blogId);

    res.json({
      success: true,
      message: "Image uploaded successfully",
      filename,
      path: `/uploads/blogs/${blogId}/${filename}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};
