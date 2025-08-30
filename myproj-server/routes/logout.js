var express = require('express');
var router = express.Router();

router.get('/', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send('Logout error');
        }
        res.redirect('/login');
    });
});

module.exports = router;
