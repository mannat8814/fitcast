
var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  const userId = req.session.userId;
  if (!userId) return res.redirect('/login');
  res.render('generate', {
      apiKey: process.env.OPENWEATHERMAP_API_KEY,
      outfit: ['Jacket', 'Jeans', 'Sneakers', 'Beanie'],
      userId: userId
    });
});

module.exports = router;
