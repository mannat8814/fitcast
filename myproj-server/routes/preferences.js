var express = require('express');
var router = express.Router();

module.exports = function(connection) {
    
    router.use((req, res, next) => {
        if (res.headersSent) return next(new Error('Cannot set headers after they are sent to the client'));
        next();
    });
    router.get('/', (req, res) => {
        //const userId = req.query.userId;
        const userId = req.session.userId;

        if (!userId) return res.redirect('/login');
        const sql = `
            SELECT temp, min, max
            FROM WeatherPreferences
            WHERE userID = ?
        `;

        connection.query(sql, [userId], (err, results) => {
            if (err) {
                console.error('Error fetching user preferences:', err);
                return res.status(500).send('Preference fetching failed.');
            }

            let defaults;
            if (results.length === 0) {
                defaults = {
                    temp1_start: -42,
                    temp1_end: 30,
                    temp2_start: 30,
                    temp2_end: 50,
                    temp3_start: 50,
                    temp3_end: 70,
                    temp4_start: 70,
                    temp4_end: 80,
                    temp5_start: 80,
                    temp5_end: 140
                };
            } else {
                defaults = {
                    temp1_start: results[0].min,
                    temp1_end: results[0].max,
                    temp2_start: results[1].min,
                    temp2_end: results[1].max,
                    temp3_start: results[2].min,
                    temp3_end: results[2].max,
                    temp4_start: results[3].min,
                    temp4_end: results[3].max,
                    temp5_start: results[4].min,
                    temp5_end: results[4].max
                };
            }

            res.render('preferences', {
                userId,
                defaults
            });
        });
    });

    router.post('/', (req, res) => {
        const { userId, temp1_start, temp1_end, temp2_start, temp2_end, temp3_start, temp3_end, temp4_start, temp4_end, temp5_start, temp5_end } = req.body;

        const preferences = [
            [userId, 1, temp1_start, temp1_end],
            [userId, 2, temp2_start, temp2_end],
            [userId, 3, temp3_start, temp3_end],
            [userId, 4, temp4_start, temp4_end],
            [userId, 5, temp5_start, temp5_end]
        ];

        const sql1 = `
            DELETE FROM WeatherPreferences WHERE userID = ?
        `;

        const sql2 = `
            INSERT INTO WeatherPreferences (userID, temp, min, max)
            VALUES ?
        `;

        connection.query(sql1, [userId], (err) => {
            if (err) {
                console.error('Error deleting previous preferences:', err);
                return res.status(500).send('Preference deletion failed.');
            }

            connection.query(sql2, [preferences], (err) => {
                if (err) {
                    console.error('Error saving preferences:', err);
                    return res.status(500).send('Preference saving failed.');
                }

                res.redirect('/');
            });
        });
    });

    return router;
};

