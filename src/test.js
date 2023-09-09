import express from 'express';
import { S3Client, AbortMultipartUploadCommand, ListBucketsCommand } from "@aws-sdk/client-s3";

const app = express();
const s3 = new S3Client({ region: 'us-east-1' });
s3.send(new ListBucketsCommand({})).then((data) => {
    console.log(data.Buckets);
    }
).catch((err) => {
    console.error(err);
    }
);