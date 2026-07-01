import { useQuery } from '@tanstack/react-query';
import { inventoryAPI, ordersAPI, optimizationAPI, scrapAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS } from '../utils/units';
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
  const { user } = useAuth();

  const { data: stats } = useQuery({ queryKey: ['inventory-stats'], queryFn: () => inventoryAPI.getStats().then(r => r.data) });
  const { data: orders } = useQuery({ queryKey: ['orders', { status: 'pending' }], queryFn: () => ordersAPI.getAll({ status: 'pending' }).then(r => r.data) });
  const { data: urgentOrders } = useQuery({ queryKey: ['orders', { priority: 'high' }], queryFn: () => ordersAPI.getAll({ priority: 'high' }).then(r => r.data) });
  const { data: jobs } = useQuery({ queryKey: ['jobs-in-progress'], queryFn: () => optimizationAPI.getJobs({ status: 'in_progress' }).then(r => r.data) });
  const { data: scrapSummary } = useQuery({ queryKey: ['scrap-summary'], queryFn: () => scrapAPI.getSummary().then(r => r.data) });

  const pendingCount = orders?.length || 0;
  const highPriorityCount = urgentOrders?.filter(o => o.status !== 'dispatched').length || 0;

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-steel-900">Dashboard</h1>
        <p className="text-steel-500 text-sm mt-1">Welcome, <strong>{user?.username}</strong></p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard title="Pending Orders" value={pendingCount} subtitle="Awaiting production" icon="📋" color="bg-yellow-50 text-yellow-700" />
        <StatCard title="High Priority" value={highPriorityCount} subtitle="Urgent" icon="🔴" color="bg-red-50 text-red-700" />
        <StatCard title="Coil Stock" value={stats ? displayWeight(stats.total_coil_kg) : '—'} subtitle={`${stats?.coil_count || 0} coils`} icon="🔩" color="bg-blue-50 text-blue-700" />
        <StatCard title="Sheet Stock" value={stats ? displayWeight(stats.total_sheet_kg) : '—'} subtitle={`${stats?.sheet_count || 0} sheets`} icon="📄" color="bg-green-50 text-green-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pending Orders */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Pending Orders (ऑर्डर)</h2>
            <a href="/orders" className="text-primary-600 text-sm hover:underline">All →</a>
          </div>
          {orders?.length === 0 ? (
            <div className="text-steel-400 text-sm text-center py-6">No pending orders</div>
          ) : (
            <div className="space-y-2">
              {orders?.slice(0, 5).map(order => (
                <div key={order._id} className="flex items-center justify-between p-3 bg-steel-50 rounded-lg">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{order.order_number}</span>
                      {order.priority === 'high' && <span className="badge-high">High</span>}
                    </div>
                    <div className="text-xs text-steel-500 truncate">{order.customer?.name}</div>
                  </div>
                  <div className="text-right ml-2 flex-shrink-0">
                    <span className={`badge-${order.status}`}>{order.status.replace('_', ' ')}</span>
                    {order.deadline && <div className="text-xs text-steel-400 mt-0.5">{new Date(order.deadline).toLocaleDateString()}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Jobs */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Active Jobs (काटा)</h2>
            <a href="/production" className="text-primary-600 text-sm hover:underline">Production →</a>
          </div>
          {!jobs?.length ? (
            <div className="text-steel-400 text-sm text-center py-6">No active cutting jobs</div>
          ) : (
            <div className="space-y-2">
              {jobs.slice(0, 5).map(job => (
                <div key={job._id} className="flex items-center justify-between p-3 bg-steel-50 rounded-lg">
                  <div>
                    <div className="font-medium text-sm">{job.job_number}</div>
                    <div className="text-xs text-steel-500">{job.machine?.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="badge-in_production">In Progress</div>
                    {job.estimated_time_hrs && <div className="text-xs text-steel-400 mt-0.5">~{job.estimated_time_hrs.toFixed(1)}h</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Wastage summary */}
        {scrapSummary && (
          <div className="card">
            <h2 className="font-semibold mb-3">Wastage Summary (बर्बादी)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-xl font-bold text-orange-600">{displayWeight(scrapSummary.total_wastage_kg)}</div>
                <div className="text-xs text-steel-500">Total Wastage</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-green-600">{displayWeight(scrapSummary.total_scrap_kg)}</div>
                <div className="text-xs text-steel-500">Scrap (रद्दी)</div>
              </div>
            </div>
          </div>
        )}

        {/* Quick actions */}
        <div className="card">
          <h2 className="font-semibold mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: '/orders', icon: '➕', label: 'New Order', sub: 'नया ऑर्डर' },
              { href: '/optimization', icon: '⚡', label: 'Optimization', sub: 'काटा' },
              { href: '/inventory/coils', icon: '🔩', label: 'Add Coil', sub: 'माल जोड़ें' },
              { href: '/inventory/sheets', icon: '📄', label: 'Add Sheet', sub: 'पत्र जोड़ें' },
            ].map(item => (
              <a key={item.href} href={item.href}
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
    </div>
  );
}
