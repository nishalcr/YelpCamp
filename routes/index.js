var express = require("express"),
  router = express.Router(),
  passport = require("passport"),
  User = require("../models/user"),
  Campground = require("../models/campground"),
  async = require("async"),
  nodemailer = require("nodemailer"),
  crypto = require("crypto"),
  multer = require("multer"),
  Notification = require("../models/notification"),
  middleware = require("../middleware");

var storage = multer.diskStorage({
  filename: function (req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});

var imageFilter = function (req, file, cb) {
  // accept image files only
  if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

var upload = multer({ storage: storage, fileFilter: imageFilter })

var cloudinary = require('cloudinary');

cloudinary.config({
  cloud_name: 'yelpcamp-ncr',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});



//root route
router.get("/", function (req, res) {
  res.render("landing");
});

// show register form
router.get("/register", function (req, res) {
  res.render("register", { pageType: 'register' });
});


router.post("/register", upload.single('avatar'), function (req, res) {
  cloudinary.v2.uploader.upload(req.file.path, function (err, result) {
    if (err) {
      req.flash('error', err.message);
      return res.redirect('back');
    }
    // add cloudinary url for the image to the campground object under image property
    req.body.avatar = result.secure_url;
    // add image's public_id to campground object
    req.body.avatarId = result.public_id;

    var newUser = new User({
      username: req.body.username,
      firstName: req.body.firstName,
      lastName: req.body.lastName,
      email: req.body.email,
      avatar: req.body.avatar,
      avatarId: req.body.avatar
    });

    if (req.body.adminCode === ADMINPW) {
      newUser.isAdmin = true;
    }

    User.register(newUser, req.body.password, function (err, user) {
      if (err) {
        console.log(err);
        return res.render("register", { "error": err.message });
      }

      passport.authenticate("local")(req, res, function () {
        req.flash("success", "Welcome to YelpCamp " + user.username);
        res.redirect("/campgrounds");
      });
    });
  });
});

//show login form
router.get("/login", function (req, res) {
  res.render("login", { pageType: "login" });
});

//handling login logic
router.post('/login', function (req, res, next) {
  passport.authenticate('local', function (err, user, info) {

    if (err) return next(err);

    if (!user) {
      req.flash("error", "Invalid username or password!");
      return res.redirect('/login');
    }

    req.logIn(user, function (err) {
      if (err) return next(err);

      var redirectTo = req.session.redirectTo ? req.session.redirectTo : "/campgrounds";
      delete req.session.redirectTo;

      req.flash("success", "Welcome to YelpCamp!");
      res.redirect(redirectTo);
    });
  })(req, res, next);
});

// logout route
router.get("/logout", function (req, res) {
  req.logout();
  req.flash("success", "Logged you out!");
  res.redirect("/campgrounds");
});

// forgot password
router.get('/forgot', function (req, res) {
  res.render('forgot');
});

router.post('/forgot', function (req, res, next) {
  async.waterfall([
    function (done) {
      crypto.randomBytes(20, function (err, buf) {
        var token = buf.toString('hex');
        done(err, token);
      });
    },
    function (token, done) {

      User.findOne({ email: req.body.email }, function (err, user) {

        if (err) console.log(err);

        if (!user) {
          req.flash('error', 'No account with that email address exists.');
          return res.redirect('/forgot');
        }

        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 300000; // 5 minutes

        user.save(function (err) {
          done(err, token, user);
        });
      });
    },
    function (token, user, done) {
      var smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'yelpcamp.ncr@gmail.com',
          pass: process.env.GMAILPW
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'yelpcamp.ncr@gmail.com',
        subject: 'YelpCamp-NCR Password Reset',
        text: 'You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n' +
          'Please click on the following link, or paste this into your browser to complete the process:\n\n' +
          'http://' + req.headers.host + '/reset/' + token + '\n\n' +
          'If you did not request this, please ignore this email and your password will remain unchanged.\n'
      };
      smtpTransport.sendMail(mailOptions, function (err) {
        console.log('mail sent');
        req.flash('success', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
        done(err, 'done');
      });
    }
  ], function (err) {
    if (err) return next(err);
    res.redirect('/reset');
  });
});

router.get('/reset/:token', function (req, res) {
  User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
    if (err) console.log(err);

    if (!user) {
      req.flash('error', 'Password reset token is invalid or has expired.');
      return res.redirect('/forgot');
    }
    res.render('reset', { token: req.params.token });
  });
});

router.post('/reset/:token', function (req, res) {
  async.waterfall([
    function (done) {
      User.findOne({ resetPasswordToken: req.params.token, resetPasswordExpires: { $gt: Date.now() } }, function (err, user) {
        if (err) console.log(err);

        if (!user) {
          req.flash('error', 'Password reset token is invalid or has expired.');
          return res.redirect('back');
        }
        if (req.body.password === req.body.confirm) {
          user.setPassword(req.body.password, function (err) {
            if (err) console.log(err);
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;

            user.save(function (err) {
              if (err) console.log(err);
              req.logIn(user, function (err) {
                done(err, user);
              });
            });
          })
        }
        else {
          req.flash("error", "Passwords do not match.");
          return res.redirect('back');
        }
      });
    },
    function (user, done) {
      var smtpTransport = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'yelpcamp.ncr@gmail.com',
          pass: process.env.GMAILPW
        }
      });
      var mailOptions = {
        to: user.email,
        from: 'yelpcamp.ncr@mail.com',
        subject: 'Your password has been changed',
        text: 'Hello,\n\n' +
          'This is a confirmation that the password for your account ' + user.email + ' has just been changed.\n'
      };
      smtpTransport.sendMail(mailOptions, function (err) {
        req.flash('success', 'Success! Your password has been changed.');
        done(err);
      });
    }
  ], function (err) {
    if (err) console.log(err);
    res.redirect('/campgrounds');
  });
});

// // user profiles
// router.get("/users/:id", function (req, res) {
//   User.findById(req.params.id, function (err, foundUser) {
//     if (err) {
//       req.flash("error", "Something went wrong.");
//       return res.redirect("/");
//     }

//     Campground.find().where('author.id').equals(foundUser._id).exec(function (err, campgrounds) {
//       if (err) {
//         req.flash("error", "Something went wrong.");
//         return res.redirect("/");
//       }
//       res.render("users/show", { user: foundUser, campgrounds: campgrounds, page: "userProfile" });
//     });
//   });
// });


// user profiles
router.get("/users/:id", function (req, res) {
  User.findById(req.params.id).populate("followers").exec(function (err, foundUser) {
    if (err) {
      req.flash("error", "Something went wrong.");
      return res.redirect("/");
    }

    Campground.find().where('author.id').equals(foundUser._id).exec(function (err, campgrounds) {
      if (err) {
        req.flash("error", "Something went wrong.");
        return res.redirect("/");
      }
      res.render("users/show", { user: foundUser, campgrounds: campgrounds, pageType: "userProfile", showSearchForm: true });
    });
  });
});


// follow user
router.get('/follow/:id', middleware.isLoggedIn, async function (req, res) {
  try {
    let user = await User.findById(req.params.id);
    user.followers.push(req.user._id);
    user.save();
    req.flash('success', 'Successfully followed ' + user.username + '!');
    res.redirect('/users/' + req.params.id);
  }
  catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// view all notifications
router.get('/notifications', middleware.isLoggedIn, async function (req, res) {
  try {
    let user = await User.findById(req.user._id).populate({
      path: 'notifications',
      options: { sort: { "_id": -1 } }
    }).exec();
    let allNotifications = user.notifications;
    res.render('notifications/index', { allNotifications, pageType: "notify", showSearchForm: true });
  }
  catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});

// handle notification
router.get('/notifications/:id', middleware.isLoggedIn, async function (req, res) {
  try {
    let notification = await Notification.findById(req.params.id);
    notification.isRead = true;
    notification.save();
    res.redirect(`/campgrounds/${notification.campgroundId}`);
  }
  catch (err) {
    req.flash('error', err.message);
    res.redirect('back');
  }
});


module.exports = router;
