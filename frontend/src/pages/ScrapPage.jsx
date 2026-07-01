import { useQuery } from '@tanstack/react-query';
import { scrapAPI } from '../services/api';
import { displayWeight } from '../utils/units';
import PageHeader from '../components/PageHeader';

export default function ScrapPage() {
  const { data: scrap, isLoading } = useQuery({
    queryKey: ['scrap'],
    queryFn: () => scrapAPI.getAll().then(r => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ['scrap-summary'],
    queryFn: () => scrapAPI.getSummary().then(r => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Scrap Tracking (रद्दी / कबाड़)"
        subtitle="Track scrap generated from cutting jobs"
        actions={<button onClick={() => window.print()} className="btn-secondary no-print">🖨️ Print</button>}
      />

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Wastage (बर्बादी)', value: displayWeight(summary.total_wastage_kg), color: 'text-red-600', icon: '⚠️' },
            { label: 'Scrap in Stock (कबाड़)', value: displayWeight(summary.total_scrap_kg), color: 'text-green-600', icon: '♻️' },
          ].map(stat => (
            <div key={stat.label} className="card flex items-center gap-3">
              <div className="text-2xl">{stat.icon}</div>
              <div>
                <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-steel-500">{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {scrap?.scrap_items?.length === 0 && <div className="card text-center text-steel-400 py-8">No scrap data yet</div>}
        {scrap?.scrap_items?.map((s, i) => (
          <div key={i} className="card">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="font-medium">{s.job_number}</div>
                <div className="text-xs text-steel-500">Order: {s.order_number || '—'}</div>
              </div>
              <span className="text-sm font-bold text-orange-600">{displayWeight(s.scrap_kg)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-steel-600">
              <div><span className="text-xs text-steel-400">Machine</span><div>{s.machine || '—'}</div></div>
              <div><span className="text-xs text-steel-400">Status</span><div className="capitalize">{s.status}</div></div>
              <div><span className="text-xs text-steel-400">Date</span><div>{s.date ? new Date(s.date).toLocaleDateString() : '—'}</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 border-b border-steel-200">
            <tr>
              {['Job #', 'Order #', 'Machine', 'Scrap (kg)', 'Status', 'Date'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-steel-400">Loading...</td></tr>}
            {scrap?.scrap_items?.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-steel-400">No scrap data yet</td></tr>
            )}
            {scrap?.scrap_items?.map((s, i) => (
              <tr key={i} className="hover:bg-steel-50">
                <td className="px-4 py-3 font-medium">{s.job_number}</td>
                <td className="px-4 py-3">{s.order_number || '—'}</td>
                <td className="px-4 py-3">{s.machine || '—'}</td>
                <td className="px-4 py-3 font-medium text-orange-600">{displayWeight(s.scrap_kg)}</td>
                <td className="px-4 py-3 capitalize">{s.status}</td>
                <td className="px-4 py-3 text-steel-500">{s.date ? new Date(s.date).toLocaleDateString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
