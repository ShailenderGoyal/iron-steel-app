import { useQuery } from '@tanstack/react-query';
import { inventoryAPI, customersAPI } from '../services/api';
import { displayWeight } from '../utils/units';
import { useAuth } from '../context/AuthContext';

function StatCard({ title, value, subtitle, icon, color = 'bg-primary-50 text-primary-700' }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${color}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xl md:text-2xl font-bold text-steel-900 truncate">{value}</div>
        <div className="text-xs md:text-sm font-medium text-steel-700 truncate">{title}</div>
        {subtitle && <div className="text-xs text-steel-400 truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, isOwner } = useAuth();

  const { data: stats } = useQuery({ queryKey: ['inventory-stats'], queryFn: () => inventoryAPI.getStats().then(r => r.data) });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => customersAPI.getAll().then(r => r.data), enabled: isOwner });

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-steel-900">Dashboard</h1>
        <p className="text-steel-500 text-sm mt-1">Welcome, <strong>{user?.username}</strong></p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard title="Coil Stock" value={stats ? displayWeight(stats.total_coil_kg) : '—'} subtitle={`${stats?.coil_count || 0} coils`} icon="🔩" color="bg-blue-50 text-blue-700" />
        <StatCard title="Sheet Stock" value={stats ? displayWeight(stats.total_sheet_kg) : '—'} subtitle={`${stats?.sheet_count || 0} sheets`} icon="📄" color="bg-green-50 text-green-700" />
        <StatCard title="Total Stock" value={stats ? displayWeight(stats.total_stock_kg) : '—'} subtitle="coils + sheets" icon="📦" color="bg-indigo-50 text-indigo-700" />
        {isOwner && <StatCard title="Parties" value={customers?.length || 0} subtitle="buyers on file" icon="👥" color="bg-purple-50 text-purple-700" />}
      </div>

      {/* Low-stock alert (कम स्टॉक) */}
      {stats?.low_stock?.length > 0 && (
        <div className="card mb-5 border-l-4 border-amber-400 bg-amber-50">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-amber-800">⚠️ Low Stock — {stats.low_stock.length} item{stats.low_stock.length > 1 ? 's' : ''} at or below {stats.low_stock_threshold_pct}%</h2>
            <a href="/inventory/coils" className="text-amber-700 text-sm hover:underline">Inventory →</a>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.low_stock.slice(0, 12).map(item => (
              <span key={item._id} className="inline-flex items-center gap-1 bg-white border border-amber-200 rounded-lg px-2 py-1 text-xs">
                <span>{item.kind === 'coil' ? '🔩' : '📄'}</span>
                <span className="font-medium">{item.label}</span>
                <span className="text-amber-700 font-semibold">{item.remaining_pct}%</span>
                <span className="text-steel-400">({displayWeight(item.remaining_kg)})</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="card">
        <h2 className="font-semibold mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { href: '/inventory/coils', icon: '🔩', label: 'Add Coil', sub: 'माल जोड़ें' },
            { href: '/inventory/sheets', icon: '📄', label: 'Add Sheet', sub: 'पत्र जोड़ें' },
            { href: '/customers', icon: '👥', label: 'Parties', sub: 'पार्टी' },
            { href: '/customers', icon: '🔎', label: 'Search by Size', sub: 'साइज़ खोजें' },
          ].map((item, i) => (
            <a key={i} href={item.href}
              className="flex items-center gap-2 p-3 bg-steel-50 rounded-lg hover:bg-steel-100 transition-colors">
              <span className="text-xl">{item.icon}</span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.label}</div>
                <div className="text-xs text-steel-400 truncate">{item.sub}</div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
