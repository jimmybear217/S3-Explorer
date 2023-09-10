const settings = require('./settings.json');
const { randomKey, encryptString, decryptString } = require('./cryptotools.js');
const bcrypt = require('bcrypt');
const fs = require('fs');
const { Console } = require('console');


class loginHandler {
    constructor() {
        if (!settings.allowLogin) return false;  // only allow login if configured
        this.settings = settings.saveUserConfig; // load settings
        this.userConfig = {};                    // init user config
        this.readUserConfig();                   // read user config
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
        this.readUserConfig();
        if (this.userConfig[username]) {
            return (bcrypt.compareSync(password, this.userConfig[username].password));
        } else {
            return false;
        }
    }

    // create user
    createUser(username, email, password) {
        this.readUserConfig();
        if (userConfig[username]) return false; // user already exists
        this.userConfig[username] = {
            password: bcrypt.hashSync(password, this.settings.saltRounds),
            email: email,
            configList: []
        };
        this.writeUserConfig();
        return this.login(username, password);
    }

    // update user data
    updateUserData(username, field, value) {
        this.readUserConfig();
        if (!this.userConfig[username]) return false; // user does not exist
        this.userConfig[username][field] = value;
        this.writeUserConfig();
        return true;
    }

    // get user data
    getUserData(username, field) {
        this.readUserConfig();
        if (!this.userConfig[username]) return false; // user does not exist
        return this.userConfig[username][field];
    }
}


module.exports = loginHandler;