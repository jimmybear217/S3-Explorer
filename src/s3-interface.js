const { S3Client, ListObjectsV2Command, ListBucketsCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const {getSignedUrl} = require("@aws-sdk/s3-request-presigner");
const settings = require('./settings.json');
const fs = require('fs');

class s3Interface {

	constructor(config) {
		if (config.accessKeyId && config.secretAccessKey) {
			this.s3client = new S3Client({
				region: config.region,
				credentials: {
					accessKeyId: config.accessKeyId,
					secretAccessKey: config.secretAccessKey
				}
			});
		} else {
			this.s3client = new S3Client({ region: config.region });
		}
	}
	listBuckets = async () => {
		const command = new ListBucketsCommand({});
		
		try {
			const { Owner, Buckets } = await this.s3client.send(command);
			console.log(
			`${Owner.DisplayName} owns ${Buckets.length} bucket${
				Buckets.length === 1 ? "" : "s"
			}: ${Buckets.map((B) => B.Name).join(", ")}`
			);
			return Buckets;
		} catch (err) {
			console.error(err);
			return [];
		}
	};

	makeCacheFile = (bucketName, username=false) => {
		var cachePath = "";
		// cache folder
		if (settings.bucketCache.folder.startsWith("./")) {
			cachePath = settings.bucketCache.folder;
		} else {
			cachePath = "./" + settings.bucketCache.folder;
		}
		if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath);

		// cache user folder if private and set
		if (settings.bucketCache.private && username) {
			cachePath = cachePath + "/" + username;
			if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath);
		}

		// cache bucket file
		cachePath = cachePath + "/" + bucketName + ".txt";
		return cachePath;
	}

	cacheAllObjects = async (bucketName, username=false) => {
		const command = new ListObjectsV2Command({
			Bucket: bucketName,
			MaxKeys: 100,
			// Delimiter: "/",
			// Prefix: directoryName
		});
		
		try {
			let isTruncated = true;
		
			console.log("Listing all objects in bucket", bucketName," for user", username, "...\n")
			let objectCount = 0;

			// set file paths
			var cachePath = this.makeCacheFile(bucketName, username)
			var cachePathTmp = cachePath + ".tmp";
			var cachePathCount = cachePath + ".count";

			// write new empty files
			fs.writeFileSync(cachePathTmp, "");
			fs.writeFileSync(cachePathCount, "0");
		
			while (isTruncated) {
				const { Contents, IsTruncated, NextContinuationToken } = await this.s3client.send(command);
				objectCount += Contents.length;										// count objects
				const contentsList = Contents.map((c) => `${c.Key}`).join("\n");	// create list of objects for file
				fs.appendFileSync(cachePathTmp, contentsList + "\n");				// append temporary file with list of objects
				fs.writeFileSync(cachePathCount, objectCount.toString());			// write count file
				isTruncated = IsTruncated;											// check if more objects to list
				command.input.ContinuationToken = NextContinuationToken;			// set next token
			}

			fs.renameSync(cachePathTmp, cachePath, { overwrite: true });				// move temporary file to final file

			console.log("Completed listing ", objectCount, " objects in bucket", bucketName," for user", username, "...\n")
			return true;
		
		} catch (err) {
			console.error(err);
			return false;
		}
	}

	listObjects = async (bucketName, username=false) => {
		var cachePath = this.makeCacheFile(bucketName, username);
		if (!fs.existsSync(cachePath)) {
			console.log("Caching bucket", bucketName, "for user", username, "as no cache file exists");
			cacheAllObjects(bucketName, username);
		}
		console.log("Loading bucket", bucketName, "for user", username, "using cached bucket list");
		return fs.readFileSync(cachePath, 'utf8').split("\n");
	}

	listObjectsInFolder = async (bucketName, username=false, folder="") => {
		var cachePath = this.makeCacheFile(bucketName, username);
		if (!fs.existsSync(cachePath)) {
			console.log("Caching bucket", bucketName, "for user", username, "as no cache file exists");
			cacheAllObjects(bucketName, username);
		}
		console.log("Loading bucket", bucketName, "for user", username, "using cached bucket list");
		var data = fs.readFileSync(cachePath, 'utf8').split("\n");
		var existingFolders = [];
		var outputData = [];
		data = data.filter((item) => {
			if (item.startsWith(folder)) {
				var itemName = item.substring(folder.length);   // remove folder from path
				var itemPath = itemName.split("/");             // split path into array
				var itemFolder = itemPath[0];                   // get current level folder/item name
				var hasChildren = (itemPath.length > 1);        // determine if item is a folder
				if (itemFolder == "") return false;             // exclude empty lines
				if (existingFolders.includes(itemFolder)) {
					// console.log("Duplicate:", item);
					return false;
				} else {
					existingFolders.push(itemFolder);
					outputData.push({
						"file": itemFolder,
						"isFolder": hasChildren,
						"path": folder + ( folder.endsWith('/') ? "" : "/") + itemFolder + (hasChildren ? "/" : "")
					});
					console.log(itemFolder + (hasChildren ? "/" : ""));
					return true;
				}
			}
			return false;
		});
		console.log("Completed loading bucket", bucketName, "for user", username, "using cached bucket list");
		// console.log("Completed loading bucket", bucketName, "for user", username, "using cached bucket list. Found", outputData.length, "objects in folder '", folder, "' out of a total of", data.length, "objects in bucket");
		// return { "allObjects": data, "currentLevelObjects": outputData };
		return outputData;
	}

	getFileUrl = async (bucketName, fileName) => {
		const command = new GetObjectCommand({Bucket: bucketName, Key: fileName});
		return getSignedUrl(this.s3client, command, {expiresIn: 3600});
	}
}

module.exports = s3Interface;