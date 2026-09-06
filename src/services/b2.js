const {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
} = require("@aws-sdk/client-s3");

const b2Client = new S3Client({
    endpoint: process.env.B2_ENDPOINT,
    region: "us-east-005",

    credentials: {
        accessKeyId: process.env.B2_KEY_ID,
        secretAccessKey: process.env.B2_APPLICATION_KEY,
    },
});

async function uploadToB2({
                              buffer,
                              key,
                              contentType,
                          }) {
    try {
        await b2Client.send(
            new PutObjectCommand({
                Bucket: process.env.B2_BUCKET_NAME,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            })
        );

        console.log(
            "File uploaded to B2:",
            key
        );

        return key;

    } catch (error) {
        console.error(
            "B2 upload failed:"
        );

        console.error(error);

        throw error;
    }
}

async function downloadFromB2(key) {
    try {
        const response =
            await b2Client.send(
                new GetObjectCommand({
                    Bucket:
                    process.env.B2_BUCKET_NAME,

                    Key: key,
                })
            );

        const bytes =
            await response.Body.transformToByteArray();

        const buffer =
            Buffer.from(bytes);

        console.log(
            "File downloaded from B2:",
            key
        );

        return buffer;

    } catch (error) {
        console.error(
            "B2 download failed:",
            key
        );

        console.error(error);

        throw error;
    }
}

module.exports = {
    b2Client,
    uploadToB2,
    downloadFromB2,
};