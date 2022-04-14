const express = require("express");
const app = express();
app.set("view engine", "ejs");
app.use(express.static('public'))
app.use(function(req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', true);
    next();
});

app.get('/' , (req , res) => {
    var state = req.query.state
    var year = req.query.year
    res.render('grid' , {state , year})
})

app.get('/electionmap' , (req , res) => {
    var stateId = req.query.stateId
    var electionYear = req.query.electionYear
    res.render('index' , {stateId , electionYear})
})

app.listen(process.env.PORT || 5000, () => {
    console.log("server started on port 5000");
  });