var express = require('express');
var router = express.Router();
const { ensureLoggedIn } = require('../auth');

router.get('/', ensureLoggedIn, (req, res) => {
    //res.send('Welcome to your dashboard!');
});


/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

module.exports = router;
