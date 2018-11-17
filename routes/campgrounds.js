var express = require("express"),
    router = express.Router(),
    Campground = require("../models/campground"),
    User = require("../models/user"),
    Notification = require("../models/notification"),
    Review = require("../models/review"),
    middleware = require("../middleware"),
    multer = require('multer');

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

var upload = multer({ storage: storage, fileFilter: imageFilter });

var cloudinary = require('cloudinary');

cloudinary.config({
    cloud_name: 'yelpcamp-ncr',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});



//INDEX - show all campgrounds
// router.get("/", function (req, res) {
//     var noMatch = null;
//     if (req.query.search) {
//         const regex = new RegExp(escapeRegex(req.query.search), 'gi');
//         // Get all campgrounds from DB
//         Campground.find({ name: regex }, function (err, allCampgrounds) {
//             if (err) {
//                 console.log(err);
//             }
//             else {
//                 if (allCampgrounds.length < 1) {
//                     noMatch = "No campgrounds match that query, please try again.";
//                 }
//                 res.render("campgrounds/index", { campgrounds: allCampgrounds, noMatch: noMatch });
//             }
//         });
//     }
//     else {
//         // Get all campgrounds from DB
//         Campground.find({}, function (err, allCampgrounds) {
//             if (err) {
//                 console.log(err);
//             }
//             else {
//                 res.render("campgrounds/index", { campgrounds: allCampgrounds, noMatch: noMatch });
//             }
//         });
//     }
// });


//INDEX - show all campgrounds
router.get("/", function (req, res) {
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var pageNumber = pageQuery ? pageQuery : 1;
    var noMatch = null;
    if (req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        Campground.find({ name: regex }).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.countDocuments({ name: regex }).exec(function (err, count) {
                if (err) {
                    console.log(err);
                    res.redirect("back");
                }
                else {
                    if (allCampgrounds.length < 1) {
                        noMatch = "No campgrounds match that query, please try again.";
                    }
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: req.query.search
                    });
                }
            });
        });
    }
    else {
        // get all campgrounds from DB
        Campground.find({}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.countDocuments().exec(function (err, count) {
                if (err) {
                    console.log(err);
                }
                else {
                    res.render("campgrounds/index", {
                        campgrounds: allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        noMatch: noMatch,
                        search: false
                    });
                }
            });
        });
    }
});


// //CREATE - add new campground to DB
// router.post("/", middleware.isLoggedIn, upload.single('image'), function (req, res) {
//     cloudinary.v2.uploader.upload(req.file.path, function (err, result) {
//         if (err) {
//             req.flash('error', err.message);
//             return res.redirect('back');
//         }
//         // add cloudinary url for the image to the campground object under image property
//         req.body.campground.image = result.secure_url;
//         // add image's public_id to campground object
//         req.body.campground.imageId = result.public_id;
//         // add author to campground
//         req.body.campground.author = {
//             id: req.user._id,
//             username: req.user.username
//         };
//         Campground.create(req.body.campground, function (err, campground) {
//             if (err) {
//                 req.flash('error', err.message);
//                 return res.redirect('back');
//             }

//             res.redirect('/campgrounds/' + campground.id);
//         });
//     });
// });


//CREATE - add new campground to DB
router.post("/", middleware.isLoggedIn, upload.single('image'), async function (req, res) {
    // add author to campground
    req.body.campground.author = {
        id: req.user._id,
        username: req.user.username
    };


    let result = await cloudinary.v2.uploader.upload(req.file.path);

    // add cloudinary url for the image to the campground object under image property
    req.body.campground.image = result.secure_url;
    // add image's public_id to campground object
    req.body.campground.imageId = result.public_id;
    try {
        let campground = await Campground.create(req.body.campground);
        let user = await User.findById(req.user._id).populate("followers").exec();

        let newNotification = {
            username: req.user.username,
            campgroundId: campground.id
        };

        for (const follower of user.followers) {
            let notification = await Notification.create(newNotification);
            follower.notifications.push(notification);
            follower.save();
        }
        res.redirect(`/campgrounds/${campground.id}`);
    }
    catch (err) {
        req.flash('error', err.message);
        return res.redirect('back');
    }
});


//NEW - show form to create new campground
router.get("/new", middleware.isLoggedIn, function (req, res) {
    res.render("campgrounds/new");
});


// SHOW - shows more info about one campground
router.get("/:id", function (req, res) {
    //find the campground with provided ID
    Campground.findById(req.params.id).populate("comments").populate({
        path: "reviews",
        options: { sort: { createdAt: -1 } }
    }).exec(function (err, foundCampground) {
        if (err) {
            console.log(err);
        }
        else {
            //render show template with that campground
            res.render("campgrounds/show", { campground: foundCampground });
        }
    });
});


// EDIT CAMPGROUND ROUTE
router.get("/:id/edit", middleware.checkCampgroundOwnership, function (req, res) {
    Campground.findById(req.params.id, function (err, foundCampground) {
        if (err) {
            console.log(err);
        }
        else res.render("campgrounds/edit", { campground: foundCampground });
    });
});


// UPDATE CAMPGROUND ROUTE
router.put("/:id", middleware.checkCampgroundOwnership, upload.single('image'), function (req, res) {

    delete req.body.campground.rating;

    Campground.findById(req.params.id, async function (err, campground) {
        if (err) {
            req.flash("error", err.message);
            res.redirect("back");
        }
        else {
            if (req.file) {
                try {
                    await cloudinary.v2.uploader.destroy(campground.imageId);
                    var result = await cloudinary.v2.uploader.upload(req.file.path);
                    campground.imageId = result.public_id;
                    campground.image = result.secure_url;
                }
                catch (err) {
                    req.flash("error", err.message);
                    return res.redirect("back");
                }
            }
            campground.name = req.body.name;
            campground.description = req.body.description;
            campground.price = req.body.price;

            campground.save();
            req.flash("success", "Successfully Updated!");
            res.redirect("/campgrounds/" + campground._id);
        }
    });
});

// DESTROY CAMPGROUND ROUTE
router.delete("/:id", middleware.checkCampgroundOwnership, function (req, res) {
    Campground.findById(req.params.id, async function (err, campground) {
        if (err) {
            req.flash("error", err.message);
            return res.redirect("back");
        }
        try {
            await cloudinary.v2.uploader.destroy(campground.imageId);
            await Review.remove({ "_id": { $in: campground.reviews } });
            campground.remove();

            req.flash('success', 'Campground deleted successfully!');
            res.redirect('/campgrounds');
        }
        catch (err) {
            if (err) {
                req.flash("error", err.message);
                return res.redirect("back");
            }
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports = router;
