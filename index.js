const express = require("express");
const app = express();
const server = require("http").Server(app);
const io = require("socket.io")(server, { origins: "localhost:8080" });

const ca = require("chalk-animation");
const compression = require("compression");
const db = require("./db");
const bodyParser = require("body-parser");
const csurf = require("csurf");

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(compression());

if (process.env.NODE_ENV != "production") {
    app.use(
        "/bundle.js",
        require("http-proxy-middleware")({
            target: "http://localhost:8081/"
        })
    );
} else {
    app.use("/bundle.js", (req, res) => res.sendFile(`${__dirname}/bundle.js`));
}

// COOKIE SESSION
const cookieSession = require("cookie-session");
const cookieSessionMiddleware = cookieSession({
    secret: `I'm always angry.`,
    maxAge: 1000 * 60 * 60 * 24 * 90
});

app.use(cookieSessionMiddleware);
io.use(function(socket, next) {
    cookieSessionMiddleware(socket.request, socket.request.res, next);
});

//File Upload / Amazon Boilerplate//
const s3 = require("./s3");
const multer = require("multer");
const uidSafe = require("uid-safe");
const path = require("path");
const config = require("./config.json");

var diskStorage = multer.diskStorage({
    destination: function(req, file, callback) {
        callback(null, __dirname + "/uploads");
    },
    filename: function(req, file, callback) {
        uidSafe(24).then(function(uid) {
            callback(null, uid + path.extname(file.originalname));
        });
    }
});
var uploader = multer({
    storage: diskStorage,
    limits: {
        fileSize: 2097152
    }
});
//File Upload Boilerplate//

app.use(express.static("./public"));
app.use(express.static("./uploads"));
app.use(express.static("./assets"));

//Security
app.disable("x-powered-by");
app.use(csurf());
app.use(function(req, res, next) {
    res.cookie("mytoken", req.csrfToken());
    next();
});

// ----------------------------------------------

app.post("/registration", (req, res) => {
    let first = req.body.first;
    let last = req.body.last;
    let email = req.body.email;

    //hash pass & insert info into database
    db.hashedPassword(req.body.password)
        .then(hash => {
            return db.createUser(first, last, email, hash).then(result => {
                // console.log("result in db.createUser:", result.rows[0]);
                req.session.userId = result.rows[0].id;
                req.session.first = result.rows[0].first;
                req.session.last = result.rows[0].last;
                res.json({ success: true });
            });
        })
        .catch(err => {
            console.log("ERR in db.createUser:", err);
            res.json(err.column);
        });
});

app.post("/login", (req, res) => {
    let email = req.body.email;
    db.getUserByEmail(email)
        .then(results => {
            // console.log("result in server:", results);
            return db
                .checkPassword(req.body.password, results.rows[0].pass)
                .then(result => {
                    if (result == true) {
                        req.session.userId = results.rows[0].id;
                        res.json({ success: true });
                    }
                });
        })
        .catch(err => {
            console.log("ERR in db.getUser:", err);
            res.json({ success: false });
        });
});

app.get("/user", (req, res) => {
    db.getUserById(req.session.userId)
        .then(result => {
            res.json(result.rows[0]);
        })
        .catch(err => {
            console.log("ERR in getUserById:", err);
            res.json({
                success: false
            });
        });
});

app.post("/upload", uploader.single("file"), s3.upload, (req, res) => {
    if (req.file) {
        let url = req.file.filename;
        let fullUrl = config.s3Url + url;
        db.updateImage(req.session.userId, fullUrl)
            .then(result => {
                res.json(result.rows[0]);
            })
            .catch(err => {
                console.log("ERR in db.uploadImg:", err);
                res.json({
                    success: false
                });
            });
    } else {
        res.json({
            success: false
        });
    }
});

app.post("/bio", (req, res) => {
    let bio = req.body.bio;

    if (req.body.bio) {
        db.updateBio(req.session.userId, bio)
            .then(result => {
                res.json(result.rows[0]);
            })
            .catch(err => {
                console.log("ERR in db.updateBio:", err);
            });
    } else {
        res.json({
            success: false
        });
    }
});

app.get("/user/:id/info", function(req, res) {
    db.getOtherPersonInfo(req.params.id)
        .then(result => {
            res.json({ userId: req.session.userId, result: result.rows });
        })
        .catch(err => {
            console.log("err in getOtherPersonInfo:", err);
        });
});

// FRIEND BUTTONS FUNCTIONALITY
app.get("/friend/:id", (req, res) => {
    db.friends(req.params.id, req.session.userId)
        .then(result => res.json(result.rows))
        .catch(err => {
            console.log("err in db.friends:", err);
        });
});

app.post("/makeFriends/:id", (req, res) => {
    db.becomeFriends(req.params.id, req.session.userId)
        .then(() => {
            res.json({
                success: true
            });
        })
        .catch(err => {
            console.log("err in makefriends:", err);
        });
});

app.post("/cancel/:id", (req, res) => {
    db.cancelFriends(req.params.id, req.session.userId)
        .then(() => {
            res.json({
                success: true
            });
        })
        .catch(err => {
            console.log("err in cancelFriends:", err);
        });
});

app.post("/accept/:id", (req, res) => {
    db.acceptFriends(req.params.id, req.session.userId)
        .then(() => {
            res.json({
                success: true
            });
        })
        .catch(err => {
            console.log("err in db.acceptfriends:", err);
        });
});

app.post("/delete/:id", (req, res) => {
    db.deleteFriends(req.params.id, req.session.userId)
        .then(() => {
            res.json({
                success: true
            });
        })
        .catch(err => {
            console.log("err in db.deleteFriends:", err);
        });
});

app.get("/getList", (req, res) => {
    db.getList(req.session.userId)
        .then(result => {
            console.log("result:", result.rows);
            res.json(result.rows);
        })
        .catch(err => {
            console.log("err in db.getlist:", err);
        });
});

//Erases cookies and redirects to Welcome Page
app.get("/logout", (req, res) => {
    req.session = null;
    res.redirect("/welcome");
});

//checks if userId cookie exists. If so, routes to logo page.
app.get("/welcome", (req, res) => {
    if (req.session.userId) {
        res.redirect("/");
    } else {
        res.sendFile(__dirname + "/index.html");
    }
});

//star should always be at the end
app.get("*", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

// ONLY APP ROUTE WE ARE CHANGING IN OUR SERVER
server.listen(8080, () => {
    ca.rainbow("I'm listening.");
});

// im going to put all of my server-side SOCKET code here below server.listen
//listen for socket connections
//io is our server-side socket(subserver)
//socket is an object that represents the connection that just happened
//object will be responsible for maintaining a list of everyone who's currently online
// socketid: userId
let onlineUsers = {};
// let chats = []; //will have an object inside per mesg

io.on("connection", socket => {
    let socketId = socket.id;
    let userId = socket.request.session.userId;
    onlineUsers[socketId] = userId;
    // console.log("online users:", onlineUsers);
    let arrOfIds = Object.values(onlineUsers);
    // console.log("arrOfIds:", arrOfIds);

    // for UserJoined - take userid of person who just connected and convert it to info, take that info and emit it to every other connected socket (broadcast it to the client)
    db.getUsersByIds(arrOfIds)
        .then(results => socket.emit("onlineUsers", results.rows))
        .catch(err => {
            console.log("err in socket-getusersbyids", err);
        });

    if (arrOfIds.filter(id => id == userId).length == 1) {
        db.getWhoJoinedById(userId)
            .then(results => {
                socket.broadcast.emit("userJoined", results.rows[0]);
            })
            .catch(err => {
                console.log("error in userWhoJoined:", err);
            });
    }

    socket.on("disconnect", () => {
        delete onlineUsers[socketId];
        io.sockets.emit("userLeft", userId);
        // console.log(`socket with id ${socket.id} just disconnected`);
    });

    // pt.9 - 1st data flow (chatmsgs) chat - build array of 10 most recent chat messages & emit that array to the client
    socket.on("chatMsg", msg => {
        console.log("msg from chat.js:", msg);

        // create this obj in server and emit it back to the front and in redux. dispatch, action, reducer.
        // once its in redux and make sure it appears instantly\
        // let chatObj = {
        //     message: msg,
        //     first: "",
        //     last: "",
        //     profilepic: "",
        //     id
        // };
        //emit it using io.socket.emit - send it to everyone
    });
});
