var express = require('express');
var router = express.Router();

module.exports = function(connection) {

    router.get('/', (req, res) => {
        res.render('register');
    });

    router.post('/', (req, res) => {
        const { name, email, pass, location } = req.body;
    
        // Query to find the highest userID
        const getMaxUserIdSql = 'SELECT MAX(userID) AS maxUserID FROM User';
    
        connection.query(getMaxUserIdSql, (err, result) => {
            if (err) {
                console.error('Error fetching max userID:', err);
                return res.status(500).send('Failed to find the highest userID.');
            }
    
            // Get the highest userID and add 1 to generate the new userID
            const maxUserID = result[0].maxUserID || 0;  // In case no users exist, start at 0
            const newUserID = maxUserID + 1;
    
            // SQL to insert the new user
            const insertUserSql = 'INSERT INTO User (userID, name, pass, email, location) VALUES (?, ?, ?, ?, ?)';
    
            // Insert the new user into the database
            connection.query(insertUserSql, [newUserID, name, pass, email, location], (err, result) => {
                if (err) {
                    console.error('Registration error:', err);
                    return res.status(500).send('Registration failed.');
                }
    
                // Store the new userID in the session
                req.session.userId = newUserID;
    
                // Redirect to the preferences page
                res.redirect('/preferences');
            });
        });
    });
    

    return router;
};