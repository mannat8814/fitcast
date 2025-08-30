var express = require('express');
var router = express.Router();
var mysql = require('mysql2');

// Use the shared connection passed from server.js
module.exports = function(connection) {

    // GET /login
    router.get('/', function(req, res) {
        res.render('login');
    });

    // POST /login
    router.post('/', function(req, res) {
        const { email, password } = req.body;
        const sql = 'SELECT * FROM User WHERE email = ? AND pass = ?';

        connection.query(sql, [email, password], function(err, results) {
            if (err) {
                console.error('Login error:', err);
                return res.status(500).send('Server error');
            }

            if (results.length > 0) {
                req.session.userId = results[0].userID;
                res.redirect('/');
            } else {
                res.render('login', { error: 'Invalid email or password' });
            }
        });
    });

    return router;
};
