//index.js by Sufi Afifi
const express = require('express');
const {MongoClient} = require('mongodb');
const bodyParser = require('body-parser');
const session = require('express-session');
const fileUpload = require("express-fileupload");
const bcrypt = require('bcrypt');
const saltRounds = 10;

function encrypt(password) {
  return new Promise((resolve, reject) => {
    bcrypt.hash(password, saltRounds, function(err, hash) {
      if (err) reject(err);
      resolve(hash);
    });
  });
}

//import uri from env file
const uri = "mongodb://127.0.0.1:27017/?directConnection=true&serverSelectionTimeoutMS=2000&appName=mongosh+1.8.0";

// Create a new MongoClient
const client = new MongoClient(uri);


// Use connect method to connect to the Server
client.connect(err => {
    if (err) throw err;
    console.log("Connected successfully to server");
    // perform actions on the collection object
    client.close();
});

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(fileUpload());
const port = 80;

//session - Sufi Afifi(20/05/2023)
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}))

//middleware to check if user is logged in
app.use(function(req, res, next){
   var err = req.session.error;
   var msg = req.session.success;
   res.locals.admin = req.session.admin;
   res.locals.user = req.session.user;
   res.locals.data = req.session;
   res.locals.loggedIn = req.session.user ? true : false;
   delete req.session.error;
   delete req.session.success;
   res.locals.message = '';
   if (err) res.locals.message = '<p class="msg error">' + err + '</p>';
   if (msg) res.locals.message = '<p class="msg success">' + msg + '</p>';
   next();
});

//retrieve user from session 
function isAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

function isAdmin(req, res, next) {
  if (req.session.admin) {
    next();
  } else {
    res.redirect('/');
  }
}

//home page
app.get('/', function(req, res){
    //render index page with user session and image from db
    getData().then(function(result){
        return result;
    })
    .then(function(result){
      for (var i = 0; i < result.length; i++) {
        if (result[i].newUser.name == req.session.user) {
          var img = result[i].newUser.profile.image;
          var imgType = result[i].newUser.profile.contentType;
          var image = "data:" + imgType + ";base64," + img.toString('base64');
        }
      }
      res.render('index', {image: image});
    })
    .catch(function(err){
        console.log(err);
    })
});
//if user is logged in, post data to database
app.post('/', isAuth, function(req, res){
    createName(req.body.name);
    res.redirect('/');
});
 

app.get('/logout', function(req, res){
  // destroy the user's session to log them out
  // will be re-created next request
  req.session.destroy(function(){
    res.redirect('/login');
  });
});
//Sufi Afifi - 25/04/2023
app.get('/login', function(req, res){
    res.render('login');
  });
app.post('/login', express.urlencoded({ extended: false }), async function(req, res){ 
    var name = req.body.username;
    var pass = req.body.password;
    // query the mongodb for the given username and validate the password
    await checkUser(name,pass)
      .then(function(result){
          return result;
      })
      .then(function(result){
        if (result) {
          //create session globally
          req.session.regenerate( async function(err){
            if(err){ return res.send(500); }
            req.session.user = name
            if (await checkAdmin(name)) {
              req.session.admin = true;
            }
            req.session.save(function (err) {
                if (err) { return next(err) }
              res.redirect('/');
            })
          })
          console.log("User logged in");  
        } else {
          res.redirect('/login');
          console.log("User not logged in");
        }
      })
      .catch(function(err){
        console.log(err);
      })
    });
  

app.get('/signup', function(req, res){
    res.render('signup');
 });
 
//signup page
app.post('/signup', async function(req, res){
    //get multipart user input
    var user = req.body.username;
    var pass = req.body.password;
    var pass2 = req.body.password2;
    var email = req.body.email;
    var phonenum = req.body.phone;
    var birthday = req.body.birthday;
    var admin = req.body.admin;
    var file = req.files.ppfile;
    
    //convert image to base64
    var encImg = file.data.toString('base64');
    var newItem = {
        filename : file.name,
        contentType: file.mimetype,
        image:  Buffer.from(encImg, 'base64')
    };
    //check if passwords match   
      if (pass != pass2) {
        req.session.error = 'Passwords do not match';
        res.redirect('/signup');
      } else {
        //insert user, pass, image into mongodb
        var newUser = {
            name: user,
            password: await encrypt(pass),
            email: email,
            phonenum: phonenum,
            birthday: birthday,
            admin: admin,
            profile: newItem
        };
        createUser(newUser);
        res.redirect('/login');
      } 
});

app.get('/admin', function(req, res){
  getData().then(function(result){
    return result;
  })
  .then(function(result){
    res.render('listusers', {users: result});
  })
  .catch(function(err){
    console.log(err);
  })
});

app.get('/delete/:id', isAdmin, function(req, res){
  deleteUser(req.params.id);
  res.redirect('/admin');
});

app.get('/edit/:id', isAdmin, function(req, res){
  getData().then(function(result){
    return result;
  })
  .then(function(result){
    for (var i = 0; i < result.length; i++) {
      if (result[i].newUser.name == req.params.id) {
        var user = result[i];
      }
    }
    var img = user.newUser.profile.image;
    var imgType = user.newUser.profile.contentType;
    var image = "data:" + imgType + ";base64," + img.toString('base64');
    res.render('edituser', {user: user, image: image});
  })
  .catch(function(err){
    console.log(err);
  })
});

app.post('/edit/:id', isAdmin, async function(req, res){

  try{
    var newUser = {};
    var id = req.params.id;
    if(req.body.username != "") {
      newUser.name = req.body.username;
    }
    if (req.body.password != "" && req.body.password2 != "") {
      if (req.body.password == req.body.password2) {
      newUser.password = await encrypt(req.body.password);
      } else {
        req.session.error = 'Passwords do not match';
        res.redirect('/edit/' + id);
      }
    }
    if (req.body.email != "") {
      newUser.email = req.body.email;
    }
    if (req.body.phone != "") {
      newUser.phonenum = req.body.phone;
    }
    if (req.body.birthday != "") {
      newUser.birthday = req.body.birthday;
    }
    newUser.admin = req.body.admin;
    /*if (req.files.ppfile != undefined) {
      var file = req.files.ppfile;
      var encImg = file.data.toString('base64');
      var newItem = {
        filename : file.name,
        contentType: file.mimetype,
        image:  Buffer.from(encImg, 'base64')
      };
      newUser.profile = newItem;
    }*/
   //Sufi Afifi - 10/05/2023   
      updateUser(id, newUser);
      res.redirect('/admin');
    }catch(err){
      console.log(err);
    }

});

app.get('/session', function(req, res){
  res.render('session');
});


app.get('*', function(req, res){
    res.render('404');
});

app.listen(port, () => {
    console.log(`sufi-app listening at http://localhost`)
  });


/**
@param {MongoClient} client
@param {string} namevar
@param {Array} newUser
@param {string} user
@param {string} pass
 */
async function checkUser(user, pass){
    //check if user exists
    const result = await client.db("backendb").collection("users").find().toArray();
    for (var i = 0; i < result.length; i++) {
        if (result[i].newUser.name == user) {
            if (await bcrypt.compare(pass, result[i].newUser.password)) {
                return true;
            }
        }
    }
}
async function createUser(newUser){
    const result = await client.db("backendb").collection("users").insertOne({newUser});
    console.log(`New user created with the following id: ${result.insertedId}`);
}
async function checkAdmin(user){
    const result = await client.db("backendb").collection("users").find().toArray();
    for (var i = 0; i < result.length; i++) {
        if (result[i].newUser.name == user) {
            if (result[i].newUser.admin == "on") {
                return true;
            }else{
                return false;
            }
        }
    }
}
async function createName(namevar){
    const result = await client.db("backendb").collection("lab3").insertOne({name: namevar});
    console.log(`Name created with the following id: ${result.insertedId}`);
}
async function deleteUser(name){
  const result = await client.db("backendb").collection("users").find().toArray();
  for (var i = 0; i < result.length; i++) {
    if (result[i].newUser.name == name) {
      var id = result[i]._id;
    }
  }
  const result2 = await client.db("backendb").collection("users").deleteOne({_id: id});
  console.log(`User deleted with the following id: ${id}`);
}
async function updateUser(name, newUser){
  const result = await client.db("backendb").collection("users").find().toArray();
  for (var i = 0; i < result.length; i++) {
    if (result[i].newUser.name == name) {
      var id = result[i]._id;
      var oldUser = result[i].newUser;
    }
  }
  //swap value in array if it exists
    for (var key in oldUser) {
      if (newUser[key] == undefined) {
        newUser[key] = oldUser[key];
      }
    }
  const result2 = await client.db("backendb").collection("users").updateOne({_id: id}, {$set: {newUser: newUser}});
  console.log(`User updated with the following name: ${name}`);
}

async function getData(){
    const result = await client.db("backendb").collection("users").find().toArray();
    return result;
}

//Sufi Afifi - 15/05/2023