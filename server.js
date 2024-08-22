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

app.get('/elections' , (req , res) => {
    var state = req.query.state
    var year = req.query.year
    res.render('grid' , {state , year})
})

app.get('/' , (req , res) => {
    var state = req.query.state
    var year = req.query.year
    res.render('elections' , {state , year})
})

app.get('/electionmap' , (req , res) => {
    var stateId = req.query.stateId
    var electionYear = req.query.electionYear
    res.render('index' , {stateId , electionYear})
})

app.get('/indiamap' , (req , res) => {
    res.render('india')
})

app.get('/aap' , (req , res) => {
    var stateId = req.query.state
    var electionYear = req.query.year
    res.render('AAP', {stateId , electionYear})
})

app.get('/us' , (req , res) => {
    res.render('US')
})

app.listen(process.env.PORT || 10000, () => {
    console.log("server started on port 10000");
  });
