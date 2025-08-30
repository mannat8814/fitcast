const express = require('express');

module.exports = function(connection) {
    const router = express.Router();

    router.get('/', (req, res) => {
        const userId = req.session.userId;
        if (!userId) return res.redirect('/login');

        const groupsSql = `
            SELECT G.groupID, G.name 
            FROM Member M 
            JOIN \`Group\` G ON M.groupID = G.groupID 
            WHERE M.userID = ?
        `;

        const outfitsSql = `
            SELECT 
                O.outfitID, 
                O.temp, 
                O.userRating,
                O.time,
                U.userID,
                U.name AS userName,
                C.clothingID,
                C.type,
                C.color,
                C.material
            FROM Outfits O
            JOIN User U ON O.userID = U.userID
            JOIN OutfitUses OU ON O.outfitID = OU.outfitID
            JOIN ClothingOptions C ON OU.clothingID = C.clothingID
            WHERE O.userID IN (
                SELECT userID
                FROM Member
                WHERE groupID IN (
                    SELECT groupID
                    FROM Member
                    WHERE userID = ?
                )
            )
            ORDER BY O.time ASC
        `;

        const userGroupsSql = `
            SELECT 
                M.userID,
                G.groupID,
                G.name AS groupName
            FROM Member M
            JOIN \`Group\` G ON M.groupID = G.groupID
        `;

        connection.query(groupsSql, [userId], (err, groups) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Error fetching groups");
            }

            connection.query(outfitsSql, [userId], (err, outfitsRaw) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Error fetching outfits");
                }

                connection.query(userGroupsSql, (err, userGroupsRaw) => {
                    if (err) {
                        console.error(err);
                        return res.status(500).send("Error fetching user groups");
                    }

                    const userGroupsMap = {};
                    userGroupsRaw.forEach(row => {
                        if (!userGroupsMap[row.userID]) {
                            userGroupsMap[row.userID] = [];
                        }
                        userGroupsMap[row.userID].push({
                            groupID: row.groupID,
                            groupName: row.groupName
                        });
                    });

                    const outfitMap = {};
                    outfitsRaw.forEach(row => {
                        if (!outfitMap[row.outfitID]) {
                            outfitMap[row.outfitID] = {
                                outfitID: row.outfitID,
                                temp: row.temp,
                                time: row.time,
                                userName: row.userName,
                                userID: row.userID,
                                userRating: row.userRating,
                                items: [],
                                groups: userGroupsMap[row.userID] || []
                            };
                        }

                        outfitMap[row.outfitID].items.push({
                            type: row.type,
                            color: row.color,
                            material: row.material
                        });
                    });

                    const outfits = Object.values(outfitMap);

                    res.render('groups', { groups, outfits, userId });
                });
            });
        });
    });

    return router;
};