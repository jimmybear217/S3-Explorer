const crypto = require('crypto');

function randomKey(length=32) {
    var choice = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var key = '';
    for (var i = 0; i < length; i++) {
        key += choice.charAt(Math.floor(Math.random() * choice.length));
    }
    return key;
}

function encryptString(string, key) {
    var decipher = crypto.createCipheriv('bf-cbc', key, randomKey(8));
    decipher.setAutoPadding(false);
    var encrypted = decipher.update(string, 'utf-8', "base64");
    encrypted += decipher.final('base64');
    return encrypted;
}

function decryptString(string, key) {
    var decipher = crypto.createDecipheriv('bf-cbc', key, randomKey(8));
    decipher.setAutoPadding(false);
    var decrypted = decipher.update(string, 'base64', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
}

module.exports = {
    randomKey: randomKey,
    encryptString: encryptString,
    decryptString: decryptString
};