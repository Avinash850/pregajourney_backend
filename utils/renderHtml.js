import fs from "fs";
import path from "path";

const templatePath = path.resolve("templates/index.html");

export const renderHtml = (seoTags = "") => {
  let html = fs.readFileSync(templatePath, "utf8");
  html = html.replace("{{SEO_TAGS}}", seoTags);
  return html;
};
