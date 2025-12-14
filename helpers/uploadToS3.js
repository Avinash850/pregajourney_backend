import { PutObjectCommand } from "@aws-sdk/client-s3";
import s3 from "../config/s3.js";
import { v4 as uuidv4 } from "uuid";

export default async function uploadImageToS3(file, folderName = "uploads") {
  if (!file) return null;

  const fileKey = `${folderName}/${uuidv4()}-${file.originalname}`;

  const uploadParams = {
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: fileKey,
    Body: file.buffer,
    ContentType: file.mimetype,
  };

  await s3.send(new PutObjectCommand(uploadParams));

  const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

  return { fileKey, imageUrl };
}
