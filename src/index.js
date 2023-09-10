const express = require('express');
const session = require('express-session');
const S3 = require('./s3Interface.js');
const randomKey = require('./cryptotools.js').randomKey;
const path = require('path');
const ejs = require('ejs');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const settings = require('./settings.json');
const loginHandler = require('./loginHandler.js');
const { encode } = require('punycode');
const { exit } = require('process');

// init express
const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
    secret: randomKey(),
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
        res.redirect('/login' + (req.query.nextUrl) ? 'nextUrl=' + req.query.nextUrl : '?nextUrl=' + encodeURIComponent(req.originalUrl));
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
