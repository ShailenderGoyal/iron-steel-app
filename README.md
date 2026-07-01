# Iron & Steel Processing Business Management System

Built from: `Iron_Business_SRD_v2.docx`  
Version: Phase 1 MVP  
Stack: React + Tailwind CSS · Node.js + Express · MongoDB · JWT Auth

---

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- npm

### 1. Clone / Open the project
```
c:\Abhishek\iron-steel-app\
```

### 2. Configure backend
Edit `backend/.env`:
```
PORT=5000
MONGO_URI=mongodb://localhost:27017/iron_steel_db   ← or your Atlas URI
JWT_SECRET=<long random string>
JWT_EXPIRES_IN=7d
```

### 3. Install & Start
Double-click `start.bat` — or manually:

```bash
# Terminal 1 — Backend
cd backend
npm install
npm run dev

# Terminal 2 — Frontend
cd frontend
npm install
npm run dev
```

### 4. Seed initial data
```bash
cd backend
node src/services/seedData.js
```

This creates:
- **3 users** (owner1, owner2, supervisor)
- **6 machines** (Slitter 1/2/3, Shearing 1/2, CTL Line) with all specs from the SRD
- **App settings** (defaults)

### 5. Open the app
Go to: http://localhost:3000

**Default logins:**
| Username | Password | Role |
|---|---|---|
| owner1 | IronBiz@2024 | Owner (full access) |
| owner2 | IronBiz@2024 | Owner (full access) |
| supervisor | Super@2024 | Supervisor |

---

## Features (Phase 1 MVP)

### ✅ Inventory Management
- Coil entry with auto weight calculation: `(π/4) × (OD² − ID²) × Width × 0.00786`
- Sheet entry with format presets (3×8, 2×4, 8×4, 1250×2500, etc.) + manual override
- Auto weight: `L × W × T × 7.86 ÷ 10⁸`
- Filter by hardness, gauge range, supplier
- Remaining weight bar indicator
- Material movement log per item
- Print inventory list

### ✅ Machine Configuration
- All 6 machines pre-seeded from SRD specs
- Thickness ranges per hardness category (editable)
- Speed tiers per gauge range (editable)
- Cut multipliers, small cut penalty
- Activate / deactivate machines
- Owner can add new machines — immediately available to optimizer

### ✅ Customer / Party Management
- Preferred sizes per customer (used for offcut reuse suggestions)
- Full CRUD

### ✅ Supplier Management

### ✅ Order Management
- Multi-line item orders
- Default tolerances pre-filled: Width ±0.2mm, Gauge −0.1mm, Length ±0.5mm
- Priority: High / Normal
- Status workflow: Pending → In Production → Ready → Dispatched
- Print job sheet

### ✅ Cutting Optimization Engine (Core Feature)
- Greedy algorithm: finds best coil/sheet for each order line item
- Evaluates all active, capable inventory against machine specs
- Wastage % ranked (lowest = best), top 5 shown
- **Wastage cost in Rs. (बर्बादी लागत)** shown for every option
- 1× / 2× / 3× multiples support (e.g. 940mm coil for 470mm order)
- Tolerance-aware matching
- Offcut reuse detection (checks other pending orders + customer preferred sizes)
- Scrap value estimate at ~50% purchase price
- Machine assignment with estimated time calculation
- One-click confirm → creates CuttingJob, deducts inventory

### ✅ Production Planning
- Daily schedule by machine
- Machine capacity bar (used vs available hours)
- Setup change time factored in
- Job status updates
- Print production schedule

### ✅ Scrap Tracking
- Scrap generated per cutting job
- Total wastage + Rs. cost dashboard

### ✅ Settings
- Scrap rate configurable (default 50%)
- Break times (morning, lunch, tea, dinner) — configurable
- Working hours per day
- Default unit preference (mm/cm/inches/feet/meters)
- User management (owner only)

### ✅ Auth & Roles
- JWT-based login
- Owner: full access
- Supervisor: operational access (no machine config, no pricing settings, no user mgmt)

### ✅ Unit Conversion
- All dimension inputs accept mm / cm / inches / feet / meters
- Auto-converts to mm internally

### ✅ Hindi Labels
- Key terms shown in Hindi throughout the UI

---

## Project Structure

```
iron-steel-app/
├── backend/
│   ├── src/
│   │   ├── index.js              # Express server
│   │   ├── models/
│   │   │   ├── User.js
│   │   │   ├── Machine.js
│   │   │   ├── Inventory.js      # Coil + Sheet models
│   │   │   ├── Customer.js
│   │   │   ├── Order.js
│   │   │   ├── CuttingJob.js
│   │   │   └── Settings.js
│   │   ├── middleware/
│   │   │   └── auth.js           # JWT + role checks
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── inventory.js
│   │   │   ├── machines.js
│   │   │   ├── customers.js
│   │   │   ├── orders.js
│   │   │   ├── suppliers.js
│   │   │   ├── optimization.js
│   │   │   ├── production.js
│   │   │   ├── scrap.js
│   │   │   └── settings.js
│   │   └── services/
│   │       ├── optimizationEngine.js   # Greedy cutting optimizer
│   │       ├── productionPlanner.js    # Daily plan generator
│   │       └── seedData.js             # Initial data seeder
│   └── .env
└── frontend/
    └── src/
        ├── App.jsx
        ├── context/AuthContext.jsx
        ├── services/api.js
        ├── utils/units.js
        ├── components/
        │   ├── Layout.jsx
        │   ├── Modal.jsx
        │   ├── PageHeader.jsx
        │   └── UnitInput.jsx
        └── pages/
            ├── LoginPage.jsx
            ├── Dashboard.jsx
            ├── InventoryCoils.jsx
            ├── InventorySheets.jsx
            ├── MachinesPage.jsx
            ├── CustomersPage.jsx
            ├── OrdersPage.jsx
            ├── SuppliersPage.jsx
            ├── OptimizationPage.jsx
            ├── ProductionPage.jsx
            ├── ScrapPage.jsx
            └── SettingsPage.jsx
```

---

## Cloud Deployment (Production)

**Recommended free-tier stack:**
- MongoDB: [MongoDB Atlas](https://cloud.mongodb.com) (free M0 cluster)
- Backend: [Render.com](https://render.com) (free web service)
- Frontend: [Vercel](https://vercel.com) or Render static site

Update `backend/.env` with your Atlas connection string before deploying.

---

## Phase 2 Roadmap (from SRD)
- Multi-order batching optimization
- Dynamic programming algorithm for better multi-order cutting
- Leftover offcut reuse automation
- Weekly production plan
- Setup change minimization (batch same-size jobs)

## Phase 3 Roadmap
- Genetic algorithm / AI-assisted suggestions
- Margin analysis dashboard
- Mobile PWA
