import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import InventoryCoils from './pages/InventoryCoils';
import InventorySheets from './pages/InventorySheets';
import MachinesPage from './pages/MachinesPage';
import CustomersPage from './pages/CustomersPage';
import OrdersPage from './pages/OrdersPage';
import SuppliersPage from './pages/SuppliersPage';
import OptimizationPage from './pages/OptimizationPage';
import ProductionPage from './pages/ProductionPage';
import ScrapPage from './pages/ScrapPage';
import CalculatorPage from './pages/CalculatorPage';
import SettingsPage from './pages/SettingsPage';

// Lazy-loaded: keeps the charting library (recharts) out of the initial bundle.
const StatsPage = lazy(() => import('./pages/StatsPage'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="text-steel-500">Loading...</div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  const { user, isOwner } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="inventory/coils" element={<InventoryCoils />} />
        <Route path="inventory/sheets" element={<InventorySheets />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="customers" element={isOwner ? <CustomersPage /> : <Navigate to="/" replace />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="optimization" element={<OptimizationPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="scrap" element={<ScrapPage />} />
        <Route path="calculator" element={<CalculatorPage />} />
        <Route path="stats" element={isOwner ? <Suspense fallback={<div className="text-steel-500">Loading…</div>}><StatsPage /></Suspense> : <Navigate to="/" replace />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
