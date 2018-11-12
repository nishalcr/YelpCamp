var express = require("express");
var router = express.Router();
var Campground = require("../models/campground");
var middleware = require("../middleware");
var multer = require('multer');

var storage = multer.diskStorage({
    filename: function(req, file, callback) {
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
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');

cloudinary.config({ 
    cloud_name: 'yelpcamp-ncr', 
    api_key: process.env.CLOUDINARY_API_KEY, 
    api_secret: process.env.CLOUDINARY_API_SECRET
});


//INDEX - show all campgrounds
router.get("/", function(req, res){
    var noMatch = null;
    if(req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        // Get all campgrounds from DB
        Campground.find({name: regex}, function(err, allCampgrounds){
           if(err){
               console.log(err);
           } else {
              if(allCampgrounds.length < 1) {
                  noMatch = "No campgrounds match that query, please try again.";
              }
              res.render("campgrounds/index",{campgrounds:allCampgrounds, page: 'campgrounds', noMatch: noMatch});
           }
        });
    } else {
        // Get all campgrounds from DB
        Campground.find({}, function(err, allCampgrounds){
           if(err){
               console.log(err);
           } else {
              res.render("campgrounds/index",{campgrounds:allCampgrounds, page: 'campgrounds', noMatch: noMatch});
           }
        });
    }
});


//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), function(req, res) {
    cloudinary.uploader.upload(req.file.path, function(result) {
        // add cloudinary url for the image to the campground object under image property
        req.body.campground.image = result.secure_url;
        // add author to campground
        req.body.campground.author = {
            id: req.user._id,
            username: req.user.username
        };
        
        Campground.create(req.body.campground, function(err, campground) {
            if (err) {
                req.flash('error', err.message);
                return res.redirect('back');
            }
        
            res.redirect('/campgrounds/' + campground.id);
        });
    });
});

//NEW - show form to create new campground
router.get("/new", middleware.isLoggedIn, function(req, res) {
    res.render("campgrounds/new");
});

// SHOW - shows more info about one campground
router.get("/:id", function(req, res) {
    //find the campground with provided ID
    Campground.findById(req.params.id).populate("comments").exec(function(err, foundCampground) {
        if (err || !foundCampground) {
            req.flash("error", "Campground not found");
            res.redirect("back");
        }
        else {
            //render show template with that campground
            res.render("campgrounds/show", { campground: foundCampground });
        }
    });
});

// EDIT CAMPGROUND ROUTE
router.get("/:id/edit", middleware.checkCampgroundOwnership, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        if (err) {
            console.log(err);
        }
        else res.render("campgrounds/edit", { campground: foundCampground });
    });
});

// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.checkCampgroundOwnership, function(req, res) {
    // find and update the correct campground
    Campground.findOneAndUpdate(req.params.id, req.body.campground, function(err, updatedCampground) {
        if (err) {
            res.redirect("/campgrounds");
        }
        else {
            //redirect somewhere(show page)
            res.redirect("/campgrounds/" + req.params.id);
        }
    });
});

// DESTROY CAMPGROUND ROUTE
router.delete("/:id", middleware.checkCampgroundOwnership, function(req, res) {
    Campground.findOneAndDelete(req.params.id, function(err) {
        if (err) {
            res.redirect("/campgrounds");
        }
        else {
            res.redirect("/campgrounds");
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;
