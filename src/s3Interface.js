const { S3Client, ListBucketsCommand } = require("@aws-sdk/client-s3");

class S3Interface {
    constructor(region='us-west-1', credentials={}) {
        if (credentials.accessKeyId && credentials.secretAccessKey) {
            this.s3 = new S3Client({
                region: region,
                credentials: {
                    accessKeyId: credentials.accessKeyId,
                    secretAccessKey: credentials.secretAccessKey
                }
            });
        } else {
            this.s3 = new S3Client({ region: region });
        }
    }
    listBuckets() {
        this.s3.send(new ListBucketsCommand({})).then((data) => {
            console.log(data.Buckets);
            }
        ).catch((err) => {
            console.error(err);
            }
        );
    }
}

module.exports = S3Interface;