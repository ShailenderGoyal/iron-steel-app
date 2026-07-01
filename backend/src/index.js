require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const inventoryRoutes = require('./routes/inventory');
const machineRoutes = require('./routes/machines');
const customerRoutes = require('./routes/customers');
const orderRoutes = require('./routes/orders');
const supplierRoutes = require('./routes/suppliers');
const optimizationRoutes = require('./routes/optimization');
const productionRoutes = require('./routes/production');
const scrapRoutes = require('./routes/scrap');
const settingsRoutes = require('./routes/settings');

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/machines', machineRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/optimization', optimizationRoutes);
app.use('/api/production', productionRoutes);
app.use('/api/scrap', scrapRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// In production, serve the built React app from this same server (single-service deploy).
// The frontend calls the API via the relative path '/api', so same-origin means no CORS
// config and no API base URL to manage.
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(distPath));
  // SPA fallback: any non-API route returns index.html so client-side routing works.
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ message: 'Not found' });
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/iron_steel_db';

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    // Optional one-time seeding: set SEED_ON_START=true on the host, deploy once to
    // create the default users/machines/settings, then remove it. Seeding is idempotent.
    if (process.env.SEED_ON_START === 'true') {
      try {
        const { seedData } = require('./services/seedData');
        await seedData();
      } catch (err) {
        console.error('Seed-on-start failed:', err.message);
      }
    }
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
