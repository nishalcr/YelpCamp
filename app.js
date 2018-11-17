require('dotenv').load();

var express = require("express"),
    app = express(),
    bodyParser = require("body-parser"),
    mongoose = require("mongoose"),
    seedDB = require("./seeds"),
    flash = require("connect-flash"),
    passport = require("passport"),
    cookieParser = require("cookie-parser"),
    LocalStrategy = require("passport-local"),
    User = require("./models/user"),
    session = require("express-session"),
    methodOverride = require("method-override");

var campgroundRoutes = require("./routes/campgrounds"),
    commentRoutes = require("./routes/comments"),
    reviewRoutes = require("./routes/reviews"),
    indexRoutes = require("./routes/index");


mongoose.connect('mongodb://localhost:27017/yelp_camp_final', { useNewUrlParser: true });

app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));
app.use(methodOverride("_method"));
app.use(cookieParser('secret'));
app.use(flash());

//seedDB();

app.use(require("express-session")({
    secret: "MUFC IS THE BEST  FOOTBALL CLUB",
    resave: false,
    saveUninitialized: false
}));

app.locals.moment = require('moment');

app.use(passport.initialize());
app.use(passport.session());
passport.use(new LocalStrategy(User.authenticate()));
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

app.use(async function (req, res, next) {
    res.locals.currentUser = req.user;
    if (req.user) {
        try {
            let user = await User.findById(req.user._id).populate('notifications', null, { isRead: false }).exec();
            res.locals.notifications = user.notifications.reverse();
        }
        catch (err) {
            console.log(err.message);
        }
    }
    res.locals.error = req.flash("error");
    res.locals.success = req.flash("success");
    next();
});


app.use(indexRoutes);
app.use("/campgrounds", campgroundRoutes);
app.use("/campgrounds/:id/comments", commentRoutes);
app.use("/campgrounds/:id/reviews", reviewRoutes);


app.listen(process.env.PORT, process.env.IP, function () {
    console.log("The YelpCamp Server has started!");
});
