import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { statsAPI } from '../services/api';
import { displayWeight } from '../utils/units';
import { exportToCsv, stampedName } from '../utils/exportCsv';
import PageHeader from '../components/PageHeader';

function StatCard({ title, value, subtitle, color = 'bg-primary-50 text-primary-700', icon }) {
  return (
    <div className="card flex items-center gap-3">
      {icon && <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${color}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xl font-bold text-steel-900 truncate">{value}</div>
        <div className="text-xs font-medium text-steel-700 truncate">{title}</div>
        {subtitle && <div className="text-xs text-steel-400 truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

function MiniTable({ rows, render, empty, onExport }) {
  if (!rows?.length) return <div className="text-steel-400 text-sm text-center py-6">{empty}</div>;
  return (
    <div className="space-y-1.5 text-sm">
      {rows.map((r, i) => <div key={i} className="flex justify-between gap-2">{render(r)}</div>)}
    </div>
  );
}

export default function StatsPage() {
  const { data, isLoading } = useQuery({ queryKey: ['stats'], queryFn: () => statsAPI.get().then(r => r.data) });

  if (isLoading) return <div className="text-steel-400">Loading stats...</div>;
  if (!data) return <div className="text-steel-400">No data</div>;

  const { inventory, orders, jobs, over_time, machine_util, by_supplier } = data;
  const totalStock = (inventory.total_coil_kg || 0) + (inventory.total_sheet_kg || 0);

  return (
    <div>
      <PageHeader
        title="Statistics (आँकड़े)"
        subtitle="Business analytics — owner only"
        actions={<button onClick={() => window.print()} className="btn-secondary hidden sm:flex no-print">🖨️ Print</button>}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard icon="📦" color="bg-blue-50 text-blue-700" title="Total Stock" value={displayWeight(totalStock)} subtitle={`${inventory.coil_count} coils · ${inventory.sheet_count} sheets`} />
        <StatCard icon="📋" color="bg-yellow-50 text-yellow-700" title="Orders" value={orders.total} subtitle={`${orders.by_status?.pending || 0} pending`} />
        <StatCard icon="✂️" color="bg-green-50 text-green-700" title="Jobs Done" value={jobs.completed} subtitle={`${jobs.total} total`} />
        <StatCard icon="🗑️" color="bg-orange-50 text-orange-700" title="Total Wastage" value={displayWeight(jobs.total_wastage_kg)} subtitle={`avg ${jobs.avg_wastage_pct}%`} />
        <StatCard icon="♻️" color="bg-steel-100 text-steel-600" title="Scrap" value={displayWeight(jobs.total_scrap_kg)} />
        <StatCard icon="⏳" color="bg-purple-50 text-purple-700" title="Avg Stock Age" value={`${inventory.avg_age_days} d`} />
        <StatCard icon="🏭" color="bg-indigo-50 text-indigo-700" title="Material Cut" value={displayWeight(jobs.total_material_kg)} />
        <StatCard icon="⚠️" color="bg-red-50 text-red-700" title="Low Stock" value={inventory.low_stock?.length || 0} subtitle="< 20% left" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Wastage by Month (बर्बादी)</h2>
            {over_time?.length > 0 && (
              <button onClick={() => exportToCsv(stampedName('wastage_by_month'), [
                { label: 'Month', value: r => r.month }, { label: 'Wastage kg', value: r => r.wastage_kg },
                { label: 'Jobs', value: r => r.jobs }, { label: 'Efficiency %', value: r => r.efficiency_pct },
              ], over_time)} className="btn-secondary text-xs no-print">⬇️ CSV</button>
            )}
          </div>
          {over_time?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={over_time}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="wastage_kg" fill="#f97316" name="Wastage (kg)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-steel-400 text-sm text-center py-12">No cutting jobs yet</div>}
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Machine Utilization (hrs)</h2>
          {machine_util?.length ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={machine_util} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="machine" tick={{ fontSize: 11 }} width={90} />
                <Tooltip />
                <Bar dataKey="hours" fill="#3b82f6" name="Hours" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <div className="text-steel-400 text-sm text-center py-12">No jobs yet</div>}
        </div>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Oldest Stock</h2>
            {inventory.oldest?.length > 0 && (
              <button onClick={() => exportToCsv(stampedName('inventory_aging'), [
                { label: 'Item', value: r => r.label }, { label: 'Supplier', value: r => r.supplier },
                { label: 'Age (days)', value: r => r.age_days }, { label: 'Remaining kg', value: r => r.remaining_kg }, { label: 'Remaining %', value: r => r.remaining_pct },
              ], inventory.oldest)} className="btn-secondary text-xs no-print">⬇️</button>
            )}
          </div>
          <MiniTable rows={inventory.oldest} empty="No stock" render={it => (<><span className="truncate">{it.label}</span><span className="text-steel-500 whitespace-nowrap">{it.age_days}d</span></>)} />
        </div>

        <div className="card">
          <h2 className="font-semibold mb-3">Low Stock (&lt;20%)</h2>
          <MiniTable rows={inventory.low_stock} empty="All well-stocked" render={it => (<><span className="truncate">{it.label}</span><span className="text-red-500 whitespace-nowrap">{it.remaining_pct}%</span></>)} />
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Stock by Supplier</h2>
            {by_supplier?.length > 0 && (
              <button onClick={() => exportToCsv(stampedName('stock_by_supplier'), [
                { label: 'Supplier', value: r => r.supplier }, { label: 'Items', value: r => r.items }, { label: 'Kg', value: r => r.kg },
              ], by_supplier)} className="btn-secondary text-xs no-print">⬇️</button>
            )}
          </div>
          <MiniTable rows={by_supplier} empty="No suppliers" render={s => (<><span className="truncate">{s.supplier}</span><span className="text-steel-500 whitespace-nowrap">{displayWeight(s.kg)}</span></>)} />
        </div>
      </div>
    </div>
  );
}
