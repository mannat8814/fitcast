var express = require('express');
var router = express.Router();

module.exports = (connection) => {
  var router = express.Router();
  router.get('/', async (req, res) => {
    const userID = req.session.userId;
    if (!userID) return res.redirect('/login');
    try {
      const [clothing] = await connection.promise().query(`
        SELECT type, material, color, image, clothingID
        FROM ClothingOptions NATURAL JOIN UserClothing
        WHERE userId = ?
      `, userID); 



      const [outfits] = await connection.promise().query(
        `SELECT outfitID, userRating FROM Outfits WHERE userId = ?`, userID
      ); 
      const fitClothes = []
      for (const fit of outfits) {
        const [clothes] = await connection.promise().query(`
          SELECT type, material, color
          FROM UserClothing NATURAL JOIN ClothingOptions NATURAL JOIN OutfitUses NATURAL JOIN Outfits
          WHERE outfitID = ?`, fit.outfitID);
        fitClothes.push({outfitID: fit.outfitID, items: clothes, rating: fit.userRating});
      }
      // console.log(fitClothes);
      res.render('closet', { clothing, fitClothes });
    } catch (err) {
      console.error('Database error:', err);
      res.status(500).send('Server error');
    }
  });

  router.delete('/:id', async (req, res) => {
    try {
      const result = await connection.promise().query(
        'DELETE FROM UserClothing WHERE clothingID = ?', 
        [req.params.id]
      );
      
      if (result.affectedRows === 0) { 
        return res.status(404).json({ error: 'Item not found' });
      }
      
      res.status(200).json({ message: 'Item deleted successfully' });
    } catch (err) {
      console.error('Error deleting item:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.delete('/outfits/:id', async (req, res) => {
    try {
      const result = await connection.promise().query(
        'DELETE FROM Outfits WHERE outfitID = ?',
        [req.params.id]
      );
      
      if (result.affectedRows === 0) { 
        return res.status(404).json({ error: 'Outfit not found' });
      }
      
      res.status(200).json({ message: 'Outfit deleted successfully' });
    } catch (err) {
      console.error('Error deleting outfit:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
  
  return router;
}

