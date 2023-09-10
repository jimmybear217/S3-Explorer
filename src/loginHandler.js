const settings = require('./settings.json');
const { randomKey, encryptString, decryptString } = require('./cryptotools.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const { Console } = require('console');


class loginHandler {
    constructor() {
        if (!settings.allowLogin) return false;  // only allow login if configured
        this.settings = settings.saveUserConfig; // load settings
        this.validateSettings();                 // load config
        this.userConfig = {};                    // init user config
        this.readUserConfig();                   // read user config
        if (this.userConfig.length > 10)
            console.warn("[WARN] User config is larger than 10 users. Consider using a database instead.");
        this.validateUserConfig();               // validate all user config
    }

    // write user to storage medium
    writeUserConfig() {
        switch (this.settings.method) {
            default:
            case "file":
                fs.writeFileSync(this.settings.path, JSON.stringify(this.userConfig));
                break;
        }
    }

    // read user from storage medium
    readUserConfig() {
        switch (this.settings.method) {
            default:
            case "file":
                if (fs.existsSync(this.settings.path)) {
                    this.userConfig = JSON.parse(fs.readFileSync(this.settings.path));
                }
                break;
        }
    }

    // login user
    login(username, password) {
        if (this.userConfig[username]) {
            return (bcrypt.compareSync(password, this.userConfig[username].password));
        } else {
            return false;
        }
    }

    // create user
    createUser(username, email, password) {
        if (userConfig[username]) return false; // user already exists
        this.userConfig[username] = {
            password: bcrypt.hashSync(password, this.settings.saltRounds),
            email: email,
            configList: {},
            secretKey: randomKey()
        };
        this.writeUserConfig();
        return this.login(username, password);
    }

    // update user data
    updateUserData(username, field, value) {
        if (!this.userConfig[username]) return false; // user does not exist
        this.userConfig[username][field] = value;
        this.writeUserConfig();
        return true;
    }

    // get user data
    getUserData(username, field) {
        if (!this.userConfig[username]) return false; // user does not exist
        if (!this.userConfig[username][field]) return false; // field does not exist
        return this.userConfig[username][field];
    }

    // ----------------------
    // AWS Config List
    // ----------------------

    listUserConfigList(username) {
        if (!this.userConfig[username]) return false; // user does not exist
        if (!this.userConfig[username].configList) return false; // config list is empty (no configs)
        return Object.keys(this.userConfig[username].configList);
    }
    
    getUserConfigList(username, configName) {
        if (!this.userConfig[username]) return false; // user does not exist
        if (!this.userConfig[username].configList[configName]) return false; // config does not exist
        return this.userConfig[username].configList[configName];
    }

    setUserConfigList(username, configName, config) {
        if (!this.userConfig[username]) return false; // user does not exist
        this.userConfig[username].configList[configName] = config;
        this.writeUserConfig();
        return true;
    }

    deleteUserConfigList(username, configName) {
        if (!this.userConfig[username]) return false; // user does not exist
        delete this.userConfig[username].configList[configName]
        this.writeUserConfig();
        return true;
    }

    // ----------------------
    // Secure properties and values
    // ----------------------

    getSecureValue(username, encryptedValue){
        return decryptString(encryptedValue, this.settings.secureKey + this.userConfig[username].secretKey);
    }

    setSecureValue(username, plainTextValue){
        return encryptString(plainTextValue, this.settings.secureKey + this.userConfig[username].secretKey);
    }

    getSecureProperties(username, field) {
        if (!this.userConfig[username]) return false; // user does not exist
        if (!this.userConfig[username][field]) return false; // field does not exist
        return this.getSecureValue(this.userConfig[username][field]);
    }

    setSecureProperties(username, field, value) {
        if (!this.userConfig[username]) return false; // user does not exist
        this.userConfig[username][field] = this.setSecureValue(value);
        this.writeUserConfig();
        return true;
    }

    // load config
    validateSettings() {
        if (!this.settings.method) this.settings.method = "file";
        if (!this.settings.path) this.settings.path = "data/users.json";
        if (!this.settings.saltRounds) this.settings.saltRounds = 10;
        if (!this.settings.secureKey) this.settings.secureKey = randomKey();
        if (this.settings != settings.saveUserConfig) {
            settings.saveUserConfig = this.settings; // upload settings
            fs.writeFileSync(__dirname + "/settings.json", JSON.stringify(settings, null, 4)); // write settings to file
            console.log("Updated settings.json");
        }
    }

    // validate user config
    validateUserConfig() {
        console.log("Validating user config...")
        Array.from(Object.keys(this.userConfig)).map((username) => {
            if (!this.userConfig[username].password) {
                console.warn("User", username, "is missing a password");
                delete this.userConfig[username];
                console.log("Deleted user", username);
            };
            if (!this.userConfig[username].email) {
                console.warn("User", username, "is missing an email");
                delete this.userConfig[username];
                console.log("Deleted user", username);
            }
            if (!this.userConfig[username].configList) {
                console.warn("User", username, "is missing a configList");
                this.userConfig[username].configList = {};
                console.log("Generated empty config list for user", username);
            };
            if (!this.userConfig[username].secretKey) {
                console.warn("User", username, "is missing a secretKey");
                this.userConfig[username].secretKey = randomKey();
                console.log("Generated secret key for user", username);
            };
        });
        this.writeUserConfig();
        console.log("User config validated");
    }
}


module.exports = loginHandler;