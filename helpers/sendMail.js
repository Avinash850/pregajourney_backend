import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

// Load template file and replace variables
const loadTemplate = (templateName, data) => {
  const templatePath = path.resolve(`templates/${templateName}.html`);
  let template = fs.readFileSync(templatePath, "utf8");

  // Replace all {{key}} with data[key]
  for (const key in data) {
    const regex = new RegExp(`{{${key}}}`, "g");
    template = template.replace(regex, data[key]);
  }

  return template;
};

// MAIN SEND EMAIL FUNCTION
export const sendMail = async ({ to, subject, template, data }) => {
  try {
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // Load and process template
    const html = loadTemplate(template, data);

    // Send mail
    await transporter.sendMail({
      // from: process.env.EMAIL_FROM,
      from: `"Pregajourney" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      html,
    });

    console.log("📧 Email sent to:", to);
    return true;

  } catch (error) {
    console.error("❌ Email sending failed:", error);
    return false;
  }
};
