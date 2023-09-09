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

// setup express server pages
app.get('/', (req, res) => {
  ejs.renderFile(path.join(__dirname, 'pages/index.ejs'), { session: req.session, showLogin: settings.allowLogin }, {}, function(err, str){
    if (err) {
      console.log(err);
      res.redirect('/error?code=500');
    } else {
      res.send(str);
    }
  });
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
  ejs.renderFile(path.join(__dirname, 'pages/config.ejs'), { session: req.session }, {}, function(err, str){
    if (err) {
      console.log(err);
      res.redirect('/error?code=500');
    } else {
      res.send(str);
    }
  });
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

if (settings.allowLogin) {
  app.get('/login', (req, res) => {
    ejs.renderFile(path.join(__dirname, 'pages/login.ejs'), { session: req.session, error: (req.query.error == 1), registerSuccess: (req.query.success == 1) }, {}, function(err, str){
      if (err) {
        console.log(err);
        res.redirect('/error?code=500');
      } else {
        res.send(str);
      }
    });
  });

  app.post('/login', (req, res) => {
    var lh = new loginHandler();
    if (!req.body.inputUsername || !req.body.inputPassword) {
      res.redirect('/login?error=1');
      return;
    }
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
      res.redirect('/login?nextUrl=' + (req.query.nextUrl) ? encodeURIComponent(req.query.nextUrl) : ""  + '&error=1');
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
}

// force login when allowLogin is true
app.use((req, res, next) => {
  if (settings.allowLogin) {
    if (!req.session.loggedIn) {
      // user not logged in
      res.redirect('/login?nextUrl=' + encodeURIComponent(req.originalUrl));
    } else {
      // check if session is still valid
      if (req.session.cookie.expires < Date.now()) {
        // session expired
        res.redirect('/login?nextUrl=' + encodeURIComponent(req.originalUrl));
      // add elseifs for more checks here
      } else {
        next();
      }
    }
  } else {
    next();
  }
});


// handle page not found error
app.use((req, res, next) => {
  res.redirect('/error?code=404&page=' + encodeURIComponent(req.originalUrl));
  return;
});



app.listen(settings.portNumber, () => {
  console.log('App listening on port', settings.portNumber);
});
