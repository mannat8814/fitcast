var express = require('express');
var router = express.Router();
const { v4: uuidv4 } = require('uuid'); // Import UUID library for generating random UUIDs

module.exports = function(connection) {
    // Render the Add Clothes page
    router.get('/', (req, res) => {
        const userId = req.session.userId;
        if (!userId) return res.redirect('/login');

        res.render('add_clothes', { userId });
    });

    // Handle form submission to add clothes
    router.post('/', (req, res) => {
        const { type, material, tempMin, tempMax, color, secondaryColor, waterproof, image } = req.body;
        const userId = req.session.userId;

        if (!userId) {
            return res.status(401).send('Unauthorized: Please log in.');
        }

        // Use default image if none is provided
        const finalImage = image && image.trim() !== '' ? image : `https://picsum.photos/200/300?random=${uuidv4()}`;

        // Step 1: Find a matching clothing item in the ClothingOptions table
        const findClothingSql = `
            SELECT clothingID
            FROM ClothingOptions
            WHERE type = ?
              AND material = ?
              AND tempMin <= ?
              AND tempMax >= ?
              AND waterproof = ?
              AND color = ?
              AND (secondaryColor = ? OR secondaryColor IS NULL)
        `;

        connection.query(
            findClothingSql,
            [type, material, tempMin, tempMax, waterproof, color, secondaryColor || null],
            (err, results) => {
                if (err) {
                    console.error('Error finding clothing item:', err);
                    return res.status(500).send('Failed to find matching clothing item.');
                }

                if (results.length === 0) {
                    // No matching clothing item found, find the max clothingID and create a new one
                    const findMaxClothingIDSql = `SELECT MAX(clothingID) AS maxID FROM ClothingOptions`;

                    connection.query(findMaxClothingIDSql, (err, maxResults) => {
                        if (err) {
                            console.error('Error finding max clothingID:', err);
                            return res.status(500).send('Failed to find max clothingID.');
                        }

                        const maxID = maxResults[0].maxID || 0; // Default to 0 if no rows exist
                        const newClothingID = maxID + 1;

                        const createClothingSql = `
                            INSERT INTO ClothingOptions (clothingID, type, material, tempMin, tempMax, waterproof, color, secondaryColor)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        `;

                        connection.query(
                            createClothingSql,
                            [newClothingID, type, material, tempMin, tempMax, waterproof, color, secondaryColor || null],
                            (err) => {
                                if (err) {
                                    console.error('Error creating clothing item:', err);
                                    return res.status(500).send('Failed to create new clothing item.');
                                }

                                // Add the newly created clothing item to the UserClothing table
                                addUserClothing(newClothingID);
                            }
                        );
                    });
                } else {
                    // Matching clothing item found, proceed to add it to UserClothing
                    const clothingID = results[0].clothingID;
                    addUserClothing(clothingID);
                }
            }
        );

        // Helper function to add clothing to the UserClothing table
        function addUserClothing(clothingID) {
            const addUserClothingSql = `
                INSERT INTO UserClothing (clothingID, userID, image, count)
                VALUES (?, ?, ?, 1)
                ON DUPLICATE KEY UPDATE count = count + 1
            `;

            connection.query(
                addUserClothingSql,
                [clothingID, userId, finalImage],
                (err) => {
                    if (err) {
                        console.error('Error adding clothing to user:', err);
                        return res.status(500).send('Failed to add clothing to user.');
                    }

                    res.redirect('/closet'); // Redirect to the closet page after adding clothes
                }
            );
        }
    });

    return router;
};

