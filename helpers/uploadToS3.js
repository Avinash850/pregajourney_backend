const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3 = require('../config/s3');
const { v4: uuidv4 } = require('uuid');

async function uploadImageToS3(file, folderName = "uploads") {
    const fileKey = `${folderName}/${uuidv4()}-${file.originalname}`;

    const uploadParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: fileKey,
        Body: file.buffer,
        ContentType: file.mimetype
    };

    await s3.send(new PutObjectCommand(uploadParams));

    const imageUrl = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;

    return { fileKey, imageUrl };
}

module.exports = uploadImageToS3;
