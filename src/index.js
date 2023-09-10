const settings = require('./settings.json');
var newSettings = settings;
var doRestart = false;
const randomKey = require('./cryptotools.js').randomKey;
const fs = require('fs');

// init and validate settings
if (!settings.liveMode) {
  console.log("Running in debug mode");
} else {
  console.log("Running in production mode");
}
if (!settings.portNumber) {
  newSettings.portNumber = 3000;
  doRestart = true;
  console.log("No port number specified in settings.json");
}
if (!settings.allowLogin) {
  console.log("Login is disabled in settings.json");
  if (!settings.awsConfig) {
    console.warn("[WARN] No AWS config specified in settings.json while running in noLogin mode");
  }
} else {
  if (!settings.saveUserConfig) {
    newSettings.allowLogin = true;
    newSettings.saveUserConfig = {
      "saveUserConfig": {
        "method": "file",
        "path": "data/users.json",
        "saltRounds": 10
    }};
    doRestart = true;
    console.log("No user config specified in settings.json");
  }
}
if (!settings.secureKey) {
  console.log("No secure key specified in settings.json");
  newSettings.secureKey = randomKey();
  console.log("Generated secure key");
  doRestart = true;
}
if (!settings.errors || !settings.errors[404] || !settings.errors[500] || !settings.errors[501]) {
  newSettings.errors = {
        "404": {
            "text": "404 - Page not found",
            "goBackButton": true,
            "goBackButtonUrl": "/",
            "goBackButtonText": "Home"
        },
        "500": {
            "text": "Internal Server Error",
            "goBackButton": true,
            "goBackButtonUrl": "/",
            "goBackButtonText": "Home"
        },
        "501": {
            "text": "An unknown error occured",
            "goBackButton": true,
            "goBackButtonUrl": "/",
            "goBackButtonText": "Home"
        }
  };
  doRestart = true;
  console.log("Error messages missing from settings.json");
}
if (newSettings != settings || doRestart) {
  fs.writeFileSync(__dirname + '/settings.json', JSON.stringify(newSettings, null, 4));
  console.log("Settings updated");
  if (doRestart) {
    console.log("Please restart to apply changes");
    process.exit(0);
  }
} else {
  console.log("Settings validated successfully");
}
// clear up variables
delete newSettings, doRestart;

// import webserver modules
const express = require('express');
const session = require('express-session');
const ejs = require('ejs');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');

// import custom modules
const loginHandler = require('./loginHandler.js');
const S3 = require('./s3Interface.js');




// init express
const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: ( (settings.sessionKey) ? settings.sessionKey : randomKey()),
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false, // true = https only
      maxAge: 1000 * 60 * 60 * 24, // 1 day
    }
}));

function renderPage(file, data, res) {
  ejs.renderFile(path.join(__dirname, 'pages/' + file), data, {}, function(err, str){
    if (err) {
      console.log(err);
      res.redirect('/error?code=500');
    } else {
      res.send(str);
    }
  });
}

// setup express server pages
app.use((req, res, next) => {
  // set default session values
  if (!req.session.loggedIn) {
    req.session.loggedIn = false;
    req.session.username = '';
  }
  if (!req.session.aws) {
    req.session.aws = {
      bucket: '',
      region: 'us-west-1',
      accessKeyId: '',
      secretAccessKey: ''
    };
  }
  req.session.save();
  // log request
  if (!settings.liveMode)
    console.log(req.method + " " + req.url + " from " + req.ip + " (" + req.headers['user-agent'] + ")");
  next();
});

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'pages/favicon.ico'));
});

app.get('/', (req, res) => {
  renderPage('index.ejs', { session: req.session, showLogin: settings.allowLogin }, res);
});

app.get('/error', (req, res) => {
  if (!req.query.code || !settings.errors[req.query.code]) {
    code = 501;
  } else {
    code = req.query.code;
  }
  ejs.renderFile(path.join(__dirname, 'pages/error.ejs'), { errorMessage: settings.errors[code] }, {}, function(err, str){
    if (err) {
      res.send("No error page found");
    } else {
      res.send(str);
    }
  });
});

// ----------------------
// pages that don't require login
// ----------------------

app.get('/config', (req, res) => {
  if (!req.session.aws) {
    req.session.aws = {
      bucket: '',
      region: 'us-west-1',
      accessKeyId: '',
      secretAccessKey: ''
    };
    req.session.save();
  }
  renderPage('config.ejs', { session: req.session }, res);
});

app.post('/config', (req, res) => {
  req.session.aws = {
    sessionName: (!req.body.sessionName) ? "" : req.body.sessionName,
    bucket: (!req.body.inputBucket) ? "" : req.body.inputBucket,
    region: (!req.body.inputRegion) ? "" : req.body.inputRegion,
    accessKeyId: (!req.body.inputAccessKeyId) ? "" : req.body.inputAccessKeyId,
    secretAccessKey: (!req.body.inputSecretAccessKey) ? "" : req.body.inputSecretAccessKey,
  };
  req.session.save();
  res.redirect('/config');
});


// ----------------------
// login pages
// ----------------------

if (settings.allowLogin) {
  app.get('/login', (req, res) => {
    renderPage('login.ejs', { session: req.session, error: (req.query.error == 1), registerSuccess: (req.query.success == 1) }, res);
  });

  app.post('/login', (req, res) => {
    var lh = new loginHandler();
    // check if username and password are set
    if (!req.body.inputUsername || !req.body.inputPassword) {
      res.redirect('/login?error=1');
      return;
    }
    // check login credentials, set sesion and redirect
    req.body.inputUsername = encodeURIComponent(req.body.inputUsername); // prevent XSS
    if (lh.login(req.body.inputUsername, req.body.inputPassword)) {
      req.session.loggedIn = true;
      req.session.username = req.body.inputUsername;
      req.session.save();
      if (req.query.nextUrl) {
        res.redirect(req.query.nextUrl);
      } else {
        res.redirect('/');
      }
    } else {
      req.session.destroy();
      res.redirect('/login?error=1' + (req.query.nextUrl) ? "&nextUrl=" + encodeURIComponent(req.query.nextUrl) : "");
    }
  });

  app.post('/register', (req, res) => {
    var lh = new loginHandler();
    if (!req.body.inputUsername || !req.body.inputPassword || !req.body.inputEmail) {
      res.redirect('/login?error=1');
      return;
    }
    req.body.inputUsername = encodeURIComponent(req.body.inputUsername); // prevent XSS
    if (lh.createUser(req.body.inputUsername, req.body.inputEmail, req.body.inputPassword)) {
      res.redirect('/login?success=1');
    } else {
      res.redirect('/login?error=1');
    }
  });

  app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
  });

  // force login when allowLogin is true
  app.use((req, res, next) => {
    /**
     * 1. Check if user is logged in
     * 2. Check if session is expired
     */
      if (!req.session.loggedIn || req.session.cookie.expires < Date.now()) {
        // user not logged in
        console.log("User not logged in");
        req.session.destroy();
        var nextUrl = (req.originalUrl) ? encodeURIComponent(req.originalUrl) : "";
        nextUrl = (req.url) ? encodeURIComponent(req.url) : nextUrl;
        nextUrl = (req.query.nextUrl) ? encodeURIComponent(req.query.nextUrl) : nextUrl;
        var redirectUrl = '/login' + ((req.query.nextUrl) ? '?nextUrl=' + nextUrl : '');
        res.redirect(redirectUrl);
        console.log("Redirecting to " + redirectUrl)
        return;
      } else {
        next();
      }
  });
}

// ----------------------
// pages that require login
// ----------------------

// list configurations
app.get('/config/list', (req, res) => {
  var lh = new loginHandler();
  var configList = lh.getUserData(req.session.username, 'configList');
  renderPage('configList.ejs', { session: req.session, configList: configList }, res);
});

// handle page not found error
app.use((req, res, next) => {
  res.redirect('/error?code=404&page=' + encodeURIComponent(req.originalUrl));
  return;
});



app.listen(settings.portNumber, () => {
  console.log('App listening on port', settings.portNumber);
});
