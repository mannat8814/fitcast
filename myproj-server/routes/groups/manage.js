// routes/manageGroups.js
const express = require('express');
const router = express.Router();

module.exports = function(connection) {
    // Show manage groups page
    router.get('/', (req, res) => {
        const userId = req.session.userId;

        const groupsSql = `
            SELECT G.groupID, G.name, G.owner, U.name AS ownerName
            FROM Member M
            JOIN \`Group\` G ON M.groupID = G.groupID
            JOIN User U ON G.owner = U.userID
            WHERE M.userID = ?
        `;

        const membersSql = `
            SELECT M.groupID, U.userID, U.name
            FROM Member M
            JOIN User U ON M.userID = U.userID
            WHERE M.groupID IN (
                SELECT groupID FROM Member WHERE userID = ?
            )
        `;

        connection.query(groupsSql, [userId], (err, groups) => {
            if (err) {
                console.log(err);
                return res.status(500).send('Failed to get groups.');
            }
        
            connection.query(membersSql, [userId], (err, members) => {
                if (err) return res.status(500).send('Failed to get members.');
        
                // Map members by groupID
                const groupMembersMap = {};
                members.forEach(member => {
                    if (!groupMembersMap[member.groupID]) {
                        groupMembersMap[member.groupID] = [];
                    }
                    groupMembersMap[member.groupID].push(member);
                });
        
                // Attach members to each group
                groups.forEach(group => {
                    group.members = groupMembersMap[group.groupID] || [];
                });
        
                res.render('manage', { userId, groups });
            });
        });
        
    });

    // Create new group
    router.post('/create', (req, res) => {
        const userId = req.session.userId;
        const { groupName, memberIds } = req.body;
        const groupID = Math.floor(Math.random() * 1000000);

        const insertGroupSql = 'INSERT INTO `Group` (groupID, name, owner) VALUES (?, ?, ?)';
        const insertMembersSql = 'INSERT INTO Member (userID, groupID) VALUES ?';

        connection.query(insertGroupSql, [groupID, groupName, userId], (err) => {
            if (err) return res.status(500).send('Failed to create group.');

            const allMembers = [];

            // ✅ Always add the owner as a member
            allMembers.push([userId, groupID]);

            // ✅ Then add any extra members the user typed in
            if (memberIds) {
                const idArray = memberIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
                idArray.forEach(id => {
                    if (id !== userId) {  // don't duplicate the owner
                        allMembers.push([id, groupID]);
                    }
                });
            }

            connection.query(insertMembersSql, [allMembers], (err) => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Failed to add members.');
                }
                res.redirect('/groups/manage');
            });
        });
    });



    // Delete group
    router.post('/delete', (req, res) => {
        const userId = req.session.userId;
        const { groupId } = req.body;

        const ownerCheckSql = 'SELECT owner FROM `Group` WHERE groupID = ?';
        connection.query(ownerCheckSql, [groupId], (err, results) => {
            if (err || results.length === 0) return res.status(403).send('Group not found.');

            if (results[0].owner !== userId) {
                return res.status(403).send('Only the group owner can delete the group.');
            }

            // First delete members
            const deleteMembersSql = 'DELETE FROM Member WHERE groupID = ?';
            connection.query(deleteMembersSql, [groupId], (err) => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Failed to delete members.');
                }

                // Then delete group
                const deleteGroupSql = 'DELETE FROM `Group` WHERE groupID = ?';
                connection.query(deleteGroupSql, [groupId], (err) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).send('Failed to delete group.');
                    }
                    res.redirect('/groups/manage');
                });
            });
        });
    });



    // Add member to group
    // router.post('/addMember', (req, res) => {
    //     const userId = req.session.userId;
    //     const { groupId, newMemberId } = req.body;

    //     // First, check if the user is the owner
    //     const ownerCheckSql = 'SELECT owner FROM `Group` WHERE groupID = ?';
    //     connection.query(ownerCheckSql, [groupId], (err, results) => {
    //         if (err || results.length === 0) return res.status(403).send('Group not found.');

    //         if (results[0].owner !== userId) {
    //             return res.status(403).send('Only the group owner can add members.');
    //         }

    //         // Add the new member
    //         const insertSql = 'INSERT INTO Member (userID, groupID) VALUES (?, ?)';
    //         connection.query(insertSql, [newMemberId, groupId], (err) => {
    //             if (err) {
    //                 console.log(err);
    //                 return res.status(500).send('Failed to add member.');
    //             }
    //             res.redirect('/groups/manage');
    //         });
    //     });
    // });
    // Add member to group
    router.post('/addMember', (req, res) => {
        const userId = req.session.userId;
        const { groupId, newMemberId } = req.body;

        // First, check if the user is the owner
        const ownerCheckSql = 'SELECT owner FROM `Group` WHERE groupID = ?';
        connection.query(ownerCheckSql, [groupId], (err, results) => {
            if (err || results.length === 0) {
                console.error('Group not found or SQL error:', err);
                return res.redirect('/groups/manage?error=addMemberFailed');
            }

            if (results[0].owner !== userId) {
                console.warn('Unauthorized add member attempt.');
                return res.redirect('/groups/manage?error=addMemberFailed');
            }

            // Add the new member
            const insertSql = 'INSERT INTO Member (userID, groupID) VALUES (?, ?)';
            connection.query(insertSql, [newMemberId, groupId], (err) => {
                if (err) {
                    console.error('Failed to add member:', err);
                    return res.redirect('/groups/manage?error=addMemberFailed');
                }
                res.redirect('/groups/manage');
            });
        });
    });



    // Remove member from group
    router.post('/removeMember', (req, res) => {
        const userId = req.session.userId;
        const { groupId, memberId } = req.body;

        const ownerCheckSql = 'SELECT owner FROM `Group` WHERE groupID = ?';
        connection.query(ownerCheckSql, [groupId], (err, results) => {
            if (err || results.length === 0) return res.status(403).send('Group not found.');

            if (results[0].owner !== userId) {
                return res.status(403).send('Only the group owner can remove members.');
            }

            const deleteSql = 'DELETE FROM Member WHERE userID = ? AND groupID = ?';
            connection.query(deleteSql, [memberId, groupId], (err) => {
                if (err) {
                    console.log(err);
                    return res.status(500).send('Failed to remove member.');
                }
                res.redirect('/groups/manage');
            });
        });
    });

    // Search users by name (for adding members)
    router.get('/searchUser', (req, res) => {
        const userId = req.session.userId;
        const { query } = req.query; // typed text

        if (!query) {
            return res.json([]); // empty search
        }

        const searchSql = `
            SELECT userID, name
            FROM User
            WHERE name LIKE ?
            AND userID != ?
            LIMIT 10
        `;
        connection.query(searchSql, [`%${query}%`, userId], (err, results) => {
            if (err) {
                console.log(err);
                return res.status(500).send('Search failed.');
            }
            res.json(results); // send matched users
        });
    });


    

    return router;
};