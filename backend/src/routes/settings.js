const express = require('express');
const Settings = require('../models/Settings');
const { protect, ownerOnly } = require('../middleware/auth');
const router = express.Router();

router.use(protect);

router.get('/', async (req, res) => {
  try {
    let settings = await Settings.findOne({ singleton_key: 'app_settings' });
    if (!settings) settings = await Settings.create({ singleton_key: 'app_settings' });
    res.json(settings);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put('/', ownerOnly, async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate(
      { singleton_key: 'app_settings' },
      { $set: req.body },
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

module.exports = router;
