const settings = require('./settings.json');
var newSettings = settings;
var doRestart = false;
var settingsChanged = false;
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
	settingsChanged = true;
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
		settingsChanged = true;
		console.log("No user config specified in settings.json");
	}
}
if (!settings.secureKey) {
	console.log("No secure key specified in settings.json");
	newSettings.secureKey = randomKey();
	console.log("Generated secure key");
	doRestart = true;
	settingsChanged = true;
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
	settingsChanged = true;
	console.log("Error messages missing from settings.json");
}
if (!settings.bucketCache) {
	newSettings.bucketCache = {
		private: true,
		folder: "data/bucketCache"
	}
	settingsChanged = true;
	console.log("No bucket cache specified in settings.json");
}
if (newSettings != settings || settingsChanged || doRestart) {
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
const lh = new loginHandler();
const S3 = require('./s3-interface.js');




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
app.use((req, res, next) => {
	// set default session values
	if (!req.session.loggedIn) {
		req.session.loggedIn = false;
		req.session.username = '';
	}
	if (!req.session.aws) {
		req.session.aws = {
			region: 'us-west-2',
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
	res.sendFile(path.join(__dirname, 'assets/favicon.ico'));
});

app.get('/explorer.css', (req, res) => {
	res.sendFile(path.join(__dirname, 'assets/explorer.css'));
});

app.get('/icon/:mime', (req, res) => {
	var mime = req.params.mime;
	switch (mime) {
		case "folder":
			res.sendFile(__dirname + "/assets/icons/folder-breeze.svg");
			break;
		case "folder-back":
			res.sendFile(__dirname + "/assets/icons/folder-bluegrey.svg");
			break;
		case "image":
			res.sendFile(__dirname + "/assets/icons/image-x-generic.svg");
			break;
		case "video":
			res.sendFile(__dirname + "/assets/icons/video-x-generic.svg");
			break;
		case "audio":
			res.sendFile(__dirname + "/assets/icons/audio-x-generic.svg");
			break;
		case "pdf":
			res.sendFile(__dirname + "/assets/icons/application-pdf.svg");
			break;
		case "word":
			res.sendFile(__dirname + "/assets/icons/ms-word.svg");
			break;
		case "excel":
			res.sendFile(__dirname + "/assets/icons/ms-excel.svg");
			break;
		case "powerpoint":
			res.sendFile(__dirname + "/assets/icons/ms-powerpoint.svg");
			break;
		case "archive":
			res.sendFile(__dirname + "/assets/icons/archive.png");
			break;
		case "file":
			res.sendFile(__dirname + "/assets/icons/text-x-generic.svg");
			break;
		default:
		case "unknown":
			res.sendFile(__dirname + "/assets/icons/unknown.svg");
			break;
	}
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
			region: 'us-west-2',
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
		region: (!req.body.inputRegion) ? "" : req.body.inputRegion,
		accessKeyId: (!req.body.inputAccessKeyId) ? "" : req.body.inputAccessKeyId,
		secretAccessKey: (!req.body.inputSecretAccessKey) ? "" : req.body.inputSecretAccessKey,
	};
	req.session.save();
	res.redirect('/config/list');
});


// ----------------------
// login pages
// ----------------------

if (settings.allowLogin) {
	app.get('/login', (req, res) => {
		renderPage('login.ejs', { session: req.session, error: (req.query.error == 1), registerSuccess: (req.query.success == 1) }, res);
	});

	app.post('/login', (req, res) => {
		
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
				var nextUrl = (req.originalUrl) ? encodeURIComponent(req.originalUrl) : "";			// set nextUrl to original url
				nextUrl = (nextUrl == "" && req.url) ? encodeURIComponent(req.url) : nextUrl;		// set nextUrl to current url if original url is not set
				nextUrl = (req.query.nextUrl) ? encodeURIComponent(req.query.nextUrl) : nextUrl;	// set nextUrl to nextUrl query parameter if set
				var redirectUrl = '/login' + ((nextUrl != "") ? '?nextUrl=' + nextUrl : '');
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

// AWS Configuration List for user
// TODO: Encrypt the secret key

app.get('/config/list', (req, res) => {
	var configList = lh.listUserConfigList(req.session.username);
	if (!configList) configList = {};
	renderPage('configList.ejs', { session: req.session, configList: configList }, res);
});

app.get('/config/save', (req, res) => {
	if (req.session.aws)
		lh.setUserConfigList(req.session.username, req.session.aws.sessionName, req.session.aws);
	res.redirect('/config/list');
});

app.get('/config/load', (req, res) => {
	var config = lh.getUserConfigList(req.session.username, req.query.config);
	if (config)
		req.session.aws = config;
	req.session.save();
	res.redirect('/config/list');
});

app.get('/config/delete', (req, res) => {
	var config = lh.deleteUserConfigList(req.session.username, req.query.config);
	res.redirect('/config/list');
});

// AWS S3 Bucket
app.get('/bucket', (req, res) => {
	var s3 = new S3(req.session.aws);
	s3.listBuckets().then((data) => {
		data.map((bucket) => {
			bucket.cacheReady = fs.existsSync(s3.makeCacheFile(bucket.Name, req.session.username));
		});
		renderPage('bucket.ejs', { session: req.session, buckets: data }, res);
	}).catch((err) => {
		console.error(err);
		res.redirect('/error?code=500');
	});
});

app.get('/bucket/reache/:bucket', (req, res) => {
	renderPage('bucketReacheConfirm.ejs', { session: req.session, bucketName: req.params.bucket }, res);
});

app.post('/bucket/reache/:bucket', (req, res) => {
	if (req.body.confirm == "yes") {
		var s3 = new S3(req.session.aws);
		fs.unlinkSync(s3.makeCacheFile(req.params.bucket, req.session.username));
		res.redirect('/bucket/cache/' + req.params.bucket);
	} else {
		res.redirect('/bucket');
	}
});

app.get('/bucket/cache/:bucket', (req, res) => {
	var s3 = new S3(req.session.aws);
	if (fs.existsSync(s3.makeCacheFile(req.params.bucket, req.session.username))) {
		console.log("it looks like the bucket is already cached");
		res.redirect('/bucket/recache/' + req.params.bucket);
		return;
	}
	if (fs.existsSync(s3.makeCacheFile(req.params.bucket + ".tmp", req.session.username))) {
		console.log("it looks like a cachine process is already running");
		res.redirect('/bucket/waitFor/' + req.params.bucket);
		return;
	}
	s3.cacheAllObjects(req.params.bucket, req.session.username).then((data) => {
		console.log("finised caching bucket " + req.params.bucket);	
	}).catch((err) => {
		console.error(err);
		res.redirect('/error?code=500');
	});
	res.redirect('/bucket/waitFor/' + req.params.bucket);
});

app.get('/bucket/waitFor/:bucket', (req, res) => {
	renderPage('bucketWaitFor.ejs', { session: req.session, bucketName: req.params.bucket }, res);
});

app.get('/bucket/isCacheReady/:bucket', (req, res) => {
	var s3 = new S3(req.session.aws);
	var cachePath = s3.makeCacheFile(req.params.bucket, req.session.username);
	res.send({ready: fs.existsSync(cachePath), objectCount: fs.readFileSync(cachePath + ".count").toString()});
});

app.get('/explore/:bucket', (req, res) => {
	renderPage('explorer.ejs', { session: req.session, bucketName: req.params.bucket }, res);
});

app.get('/bucket/:bucket', (req, res) => {
	var s3 = new S3(req.session.aws);
	s3.listObjects(req.params.bucket, req.session.username).then((data) => {
		renderPage('bucketContents.ejs', { session: req.session, bucketName: req.params.bucket, bucketData: data }, res);
	}).catch((err) => {
		console.error(err);
		res.redirect('/error?code=500');
	});
});

app.get('/api/bucket/:bucket/:object', (req, res) => {
	var s3 = new S3(req.session.aws);
	s3.getFileUrl(req.params.bucket, decodeURIComponent(req.params.object)).then((url) => {
		res.redirect(url);
	}).catch((err) => {
		console.error(err);
		res.redirect('/error?code=500');
	});
});

app.get('/api/bucket/:bucket', (req, res) => {
	var s3 = new S3(req.session.aws);
	if (req.query.folder) folder = req.query.folder
	else folder = "";
	s3.listObjectsInFolder(req.params.bucket, req.session.username, folder).then((data) => {
		res.send(data)
	}).catch((err) => {
		console.error(err);
		res.code(500);
		res.send("[]");
	});
});

app.get('/api/bucket/:bucket/size', (req, res) => {
	var s3 = new S3(req.session.aws);
	if (req.query.folder) folder = req.query.folder
	else folder = "";
	fs.readFileSync(s3.makeCacheFile(req.params.bucket, req.session.username)).split("\n").then((data) => {
		res.send(data.length);
	}).catch((err) => {
		console.error(err);
		res.code(500);
		res.send("0");
	});
});

// handle page not found error
app.use((req, res, next) => {
	res.redirect('/error?code=404&page=' + encodeURIComponent(req.originalUrl));
	return;
});

// start express server
app.listen(settings.portNumber, () => {
	console.log('App listening on port', settings.portNumber);
});
