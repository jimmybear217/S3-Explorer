const loginHandler = require('./loginHandler.js');
const S3Interface = require('./s3-interface.js');
const process = require('process');

var folder = (process.argv.length > 2) ? process.argv[2] : "";
if (folder.startsWith("/") && folder != "") folder = folder.substring(1);
if (!folder.endsWith("/") && folder != "") folder = folder + "/";
console.log("Target Folder:", folder);

const lh = new loginHandler();
var config = lh.getUserConfigList("jimmy", "day2day-home");
var s3 = new S3Interface(config);
s3.listObjects("day2day-home", "jimmy").then((data) => {
    console.log("Found", data.length, "objects in bucket");
    var outputData = [];
    data = data.filter((item) => {
        if (item.startsWith(folder)) {
            var itemName = item.substring(folder.length);   // remove folder from path
            var itemPath = itemName.split("/");             // split path into array
            var itemFolder = itemPath[0];                   // get current level folder/item name
            var hasChildren = (itemPath.length > 1);        // determine if item is a folder
            if (itemFolder == "") return false;             // exclude empty lines
            if (outputData.includes(itemFolder)) {
                // console.log("Duplicate:", item);
                return false;
            } else {
                outputData.push({
                    "file": itemFolder,
                    "isFolder": hasChildren,
                    "Path": itemFolder + (hasChildren ? "/" : "")
                });
                // console.log(itemFolder + (hasChildren ? "/" : ""));
                return true;
            }
        }
        return false;
    });
    console.log("There are", data.length, "objects left in bucket");
});