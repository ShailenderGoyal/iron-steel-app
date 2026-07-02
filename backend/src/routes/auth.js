const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect, ownerOnly } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) => jwt.sign(
  { id },
  process.env.JWT_SECRET || 'dev_secret',
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
);

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password required' });
  }
  const user = await User.findOne({ username, isActive: true });
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const token = signToken(user._id);
  res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
});

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  res.json({ id: req.user._id, username: req.user.username, role: req.user.role });
});

// POST /api/auth/users — owner only
router.post('/users', protect, ownerOnly, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username and password required' });
    const existing = await User.findOne({ username });
    if (existing) return res.status(409).json({ message: 'Username already exists' });
    const user = await User.create({ username, password, role: role || 'supervisor' });
    res.status(201).json({ id: user._id, username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/users — owner only
router.get('/users', protect, ownerOnly, async (req, res) => {
  const users = await User.find({}).select('-password');
  res.json(users);
});

// PUT /api/auth/users/:id/password — owner only
router.put('/users/:id/password', protect, ownerOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = req.body.password;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/users/:id — owner only — edit username / role / active
router.put('/users/:id', protect, ownerOnly, async (req, res) => {
  try {
    const { username, role, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (username && username !== user.username) {
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) return res.status(409).json({ message: 'Username already exists' });
      user.username = username;
    }

    // Safety: never leave the system without an active owner
    const removingOwner = (role && role !== 'owner') || isActive === false;
    if (removingOwner && user.role === 'owner' && user.isActive) {
      const otherOwners = await User.countDocuments({ role: 'owner', isActive: true, _id: { $ne: user._id } });
      if (otherOwners === 0) return res.status(400).json({ message: 'Cannot remove or demote the last active owner' });
    }

    if (role) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;
    await user.save();
    res.json({ id: user._id, username: user.username, role: user.role, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/auth/users/:id — owner only (deactivate)
router.delete('/users/:id', protect, ownerOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'owner' && user.isActive) {
      const otherOwners = await User.countDocuments({ role: 'owner', isActive: true, _id: { $ne: user._id } });
      if (otherOwners === 0) return res.status(400).json({ message: 'Cannot deactivate the last active owner' });
    }
    user.isActive = false;
    await user.save();
    res.json({ message: 'User deactivated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
