const express = require('express');
const session = require('express-session');
const S3 = require('./s3Interface.js');
const randomKey = require('./crypto.js').randomKey;
const path = require('path');
const ejs = require('ejs');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const settings = require('./settings.json');


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

app.get('/', (req, res) => {
  console.log(req.session);
  ejs.renderFile(path.join(__dirname, 'pages/index.ejs'), { session: req.session }, {}, function(err, str){
    if (err) {
      console.log(err);
      res.redirect('/error?code=500');
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
  // if (!req.body.inputBucket || !req.body.inputRegion || !req.body.inputAccessKeyId || !req.body.inputSecretAccessKey) {
  //   res.redirect('/config', 400, 'Missing required fields');
  //   console.log('Missing required fields');
  //   return
  // }
  req.session.aws = {
    bucket: (!req.body.inputBucket) ? "" : req.body.inputBucket,
    region: (!req.body.inputRegion) ? "" : req.body.inputRegion,
    accessKeyId: (!req.body.inputAccessKeyId) ? "" : req.body.inputAccessKeyId,
    secretAccessKey: (!req.body.inputSecretAccessKey) ? "" : req.body.inputSecretAccessKey,
  };
  req.session.save();
  res.redirect('/config');
});

app.get('/error', (req, res) => {
  var errorMessages = {
    500: "Internal Server Error",
    404: "Page Not Found",
  }
  if (!errorMessages[req.query.code]) {
    req.query.code = 500;
  }
  errorMessageText = errorMessages[req.query.code]
  ejs.renderFile(path.join(__dirname, 'pages/error.ejs'), { message: errorMessageText }, {}, function(err, str){
    if (err) {
      res.send("No error page found");
    } else {
      res.send(str);
    }
  });
});


app.listen(settings.portNumber, () => {
  console.log('App listening on port', settings.portNumber);
});
