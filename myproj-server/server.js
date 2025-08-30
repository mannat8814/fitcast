require('dotenv').config(); // Load environment variables from .env file
var express = require('express');
var bodyParser = require('body-parser');
var mysql = require('mysql2');
var path = require('path');

var app = express();


const session = require('express-session');

app.use(session({
    secret: 'meow_secret_key', // change this to something secure
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
}));

const logoutRouter = require('./routes/logout');
app.use('/logout', logoutRouter);


// Set up views and EJS as template engine
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// Serve static files (like images, CSS) from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Middleware for parsing JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// MySQL connection setup using environment variables
let connection = mysql.createConnection({
    host: "34.58.141.23", // Replace with your host IP
    user: process.env.DB_USER, // Use username from .env
    password: process.env.DB_PASSWORD, // Use password from .env
    database: "FitCastDB",
    port: 3306,
    multipleStatements: true // Enable multiple statements
});

// Connect to MySQL
connection.connect((err) => {
    if(err) {
        console.error("Connection error: ", err);
        return;
    }
    console.log("Connection established");
});


var indexRouter = require('./routes/index');
app.use('/', indexRouter);

function generateOutfits(filteredClothes) {
    // Group by category prefix (e.g., 'top', 'bottoms', 'shoes', 'hat')
    const categorized = {};
    for (const item of filteredClothes) {
        const category = item.type.split("-")[0];
        if (!categorized[category]) categorized[category] = [];
        categorized[category].push(item);
    }

    // Ensure we have the required categories
    if (!categorized.top || !categorized.bottoms || !categorized.shoes) {
        console.warn("Missing required categories (top, bottoms, shoes)");
        return [];
    }

    const outfits = [];

    // Generate combinations with required items + optional hat
    for (const top of categorized.top) {
        for (const bottom of categorized.bottoms) {
            for (const shoes of categorized.shoes) {
                const hatOptions = categorized.hat || [null];
                for (const hat of hatOptions) {
                    const outfit = [top, bottom, shoes];
                    if (hat) outfit.push(hat);
                    outfits.push({
                        outfit,
                        score: scoreOutfit(outfit)
                    });
                }
            }
        }
    }

    outfits.sort((a, b) => b.score - a.score);

    return outfits;
}
  
  // Scoring heuristic
function scoreOutfit(outfit) {
    let score = 0;

    score += outfit.reduce((acc, item) => acc + (1 / (item.timesUsed + 1)), 0);

    const materials = outfit.map(i => i.material);
    const uniqueMaterials = new Set(materials);
    if (uniqueMaterials.size === 1) score += 2;
    if (uniqueMaterials.size === 2) score += 1;

    const baseColors = outfit.map(i => i.color);
    const commonColor = baseColors.every(c => c === baseColors[0]);
    if (commonColor) score += 4;

    return score;
}

function pickWeightedRandom(outfits) {
    if (outfits.length === 0) return null;

    // Skew scores to give greater weight to higher scores
    const scores = outfits.map(o => Math.pow(o.score, 2)); // square the scores to skew
    const total = scores.reduce((sum, s) => sum + s, 0);
    const probs = scores.map(s => s / total);

    // Weighted random selection
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < outfits.length; i++) {
        cumulative += probs[i];
        if (rand < cumulative) {
            return outfits[i];
        }
    }

    // Fallback (shouldn't happen)
    console.warn("Fallback to last outfit selection");
    return outfits[outfits.length - 1];
}
  

var generateRouter = require('./routes/generate');
const e = require('express');
const { Console } = require('console');
app.use('/generate', generateRouter);
app.post('/api/genOutfit', (req, res) => {
    const temp = parseFloat(req.body.temp);
    const userID = req.body.userID;

    if (isNaN(temp) || isNaN(userID)) {
        return res.status(400).json({ error: 'Invalid temperature or userID' });
    }

    connection.query(
        'CALL SuggestClothesForTemperature(?, ?)',
        [temp, userID],
        (err, results) => {
            if (err) {
                console.error('Error generating outfit:', err);
                return res.status(500).json({ error: 'Error generating outfit', error: err });
            }
            const clothes = results[0];
            const topOutfits = generateOutfits(clothes);
            const outfit = pickWeightedRandom(topOutfits);
            res.json({ outfit });
        }
    );
});

app.post('/api/saveOutfit', (req, res) => {
    const userID = req.body.userID;
    const clothing = req.body.clothing;
    const rating = req.body.rating;
    const temperature = req.body.temperature;

    if (isNaN(userID) || !Array.isArray(clothing) || isNaN(rating) || isNaN(temperature)) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    connection.query(
        'SELECT temp FROM WeatherPreferences WHERE userID = ? AND ? BETWEEN min AND max LIMIT 1',
        [userID, temperature],
        (err, results) => {
            if (err || results.length === 0) {
                console.error('Error fetching temperature rating or no match found:', err || 'No match');
                return res.status(500).json({ error: 'Error fetching temperature rating' });
            }

            const tempRating = results[0].temp;
            connection.query(
                'SELECT outfitID FROM Outfits',
                (err, results) => {
                    if (err) {
                        console.error('Error fetching outfit IDs:', err);
                        return res.status(500).json({ error: 'Error fetching outfit IDs', error: err });
                    }

                    const existingIDs = new Set(results.map(row => row.outfitID));
                    let outfitID = 1;
                    while (existingIDs.has(outfitID)) {
                        outfitID++;
                    }

                    connection.query(
                        'INSERT INTO Outfits (outfitID, time, userRating, temp, userID) VALUES (?, CURRENT_TIMESTAMP, ?, ?, ?)',
                        [outfitID, rating, tempRating, userID],
                        (err, results) => {
                            if (err) {
                                console.error('Error creating outfit:', err);
                                return res.status(500).json({ error: 'Error creating outfit', error: err });
                            }
        
                            const promises = clothing.map(clothingID => {
                                return new Promise((resolve, reject) => {
                                    connection.query(
                                        'INSERT INTO OutfitUses (outfitID, clothingID) VALUES (?, ?)',
                                        [outfitID, clothingID],
                                        (err) => {
                                            if (err) {
                                                reject(err);
                                            } else {
                                                resolve();
                                            }
                                        }
                                    );
                                });
                            });
        
                            Promise.all(promises)
                                .then(() => {
                                    res.json({ success: true });
                                })
                                .catch(err => {
                                    console.error('Error saving outfit:', err);
                                    res.status(500).json({ error: 'Error saving outfit', error: err });
                                });
                        }
                    );
                }
            );
        }
    );
});
  
const loginRouter = require('./routes/login')(connection); // pass DB connection
app.use('/login', loginRouter);
app.get('/', (req, res) => {
    res.redirect('/login');
});
const registerRouter = require('./routes/register')(connection);
const preferencesRouter = require('./routes/preferences')(connection);
const settingsRouter = require('./routes/settings')(connection);

app.use('/register', registerRouter);
app.use('/preferences', preferencesRouter);
app.use('/settings', settingsRouter);



// Route to fetch users and display as JSON
app.get('/api/users', function(req, res) {
    const limit = parseInt(req.query.limit) || 10;
    var sql = `SELECT * FROM User LIMIT ?`;
  
    connection.query(sql, [limit], function(err, results) {
        if (err) {
            console.error('Error fetching user data:', err);
            res.status(500).send({ message: 'Error fetching user data', error: err });
            return;
        }
        res.json(results);
    });
});

// Route to delete a user
app.delete('/api/deleteUser', function(req, res) {
    console.log('Received request to delete user:', req.body);
    if (!req.body.userId) {
        console.log('Missing user ID');
        return res.status(400).send({ message: 'Missing user ID' });
    }
    const userId = req.body.userId;
  
    const sql = 'DELETE FROM User WHERE userID = ?';
  
    connection.query(sql, [userId], function(err, results) {
        if (err) {
            console.log('Error deleting user:', err);
            res.status(500).send({ message: 'Error deleting user', error: err });
            return;
        }
        if (results.affectedRows === 0) {
            console.log('User not found');
            res.status(404).send({ message: 'User not found' });
        } else {
            res.json({ message: 'User deleted successfully' });
        }
    });
});

// Route to fetch users and render them in an EJS template
app.get('/users', function(req, res) {
    var sql = "SELECT * FROM User LIMIT 10";
  
    connection.query(sql, function(err, results) {
        if (err) {
            console.error('Error fetching user data:', err);
            res.status(500).send({ message: 'Error fetching user data', error: err });
            return;
        }
        res.render('users', { users: results });
    });
});


var closetRouter = require('./routes/closet')(connection);
app.use('/closet', closetRouter);

const groupsRouter = require('./routes/groups')(connection);
app.use('/groups', groupsRouter);
const manGroupsRouter = require('./routes/groups/manage')(connection);
app.use('/groups/manage', manGroupsRouter);
const addClothesRouter = require('./routes/add_clothes')(connection);
app.use('/add_clothes', addClothesRouter);


app.get('/api/leaderboard', (req, res) => {
    const requestingUserID = req.query.userID; // Get userID from the query parameters

    if (!requestingUserID) {
        return res.status(400).json({ error: 'Bad Request: Missing userID in the request' });
    }

    const sql = `
        SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;

        START TRANSACTION;

        SET @requestingUserID = ?;

        WITH user_groups AS (
          SELECT groupID
          FROM Member
          WHERE userID = @requestingUserID
        ),
        group_outfit_counts AS (
          SELECT
            g.groupID,
            g.name AS groupName,
            COUNT(o.outfitID) AS outfitCount,
            CASE
              WHEN g.groupID IN (SELECT groupID FROM user_groups) THEN 1
              ELSE 0
            END AS isUserInGroup
          FROM \`Group\` g
          LEFT JOIN Member m ON g.groupID = m.groupID
          LEFT JOIN Outfits o ON m.userID = o.userID AND o.time >= CURDATE() - INTERVAL 7 DAY
          GROUP BY g.groupID, g.name
        ),
        ranked_groups AS (
          SELECT
            groupID,
            groupName,
            outfitCount,
            isUserInGroup,
            RANK() OVER (ORDER BY outfitCount DESC) AS \`rank\`
          FROM group_outfit_counts
        )
        SELECT * FROM (
          (SELECT * FROM ranked_groups ORDER BY \`rank\` LIMIT 20)
          UNION
          (SELECT * FROM ranked_groups WHERE groupID IN (SELECT groupID FROM user_groups))
        ) AS full_leaderboard
        ORDER BY \`rank\`;

        COMMIT;
    `;

    connection.query(sql, [requestingUserID], (err, results) => {
        if (err) {
            console.error('Error fetching leaderboard:', err);
            return res.status(500).json({ error: 'Error fetching leaderboard', details: err });
        }

        res.json(results); // Return the final SELECT result
    });
});

// Start the server
app.listen(8080, function () {
    console.log('Node app is running on port 8080');
});
