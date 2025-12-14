import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../config/s3.js";

export default async function deleteFromS3(key) {
  if (!key) return;

  const params = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  };

  try {
    await s3.send(new DeleteObjectCommand(params));
  } catch (err) {
    console.error("❌ Failed to delete image from S3:", err);
  }
}
