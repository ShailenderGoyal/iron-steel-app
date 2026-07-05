import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { productionAPI, ordersAPI, machinesAPI, inventoryAPI } from '../services/api';
import { displayWeight, JOB_STATUS_LABELS, HARDNESS_LABELS } from '../utils/units';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const STATUS_COLORS = {
  planned: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

// Duration between two timestamps as "Xh Ym"; '—' if incomplete.
function duration(start, end) {
  if (!start || !end) return null;
  const mins = Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
const fmtTime = t => (t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null);

const emptyLog = {
  order_id: '', line_item_id: '', machine_id: '', inventory_id: '', inventory_type: 'coil',
  material_weight_kg: '', output_kg: '', wastage_kg: '', scrap_kg: '',
  estimated_time_hrs: '', actual_start: '', actual_end: '', status: 'completed', notes: '',
};

export default function ProductionPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));
  const [showLog, setShowLog] = useState(false);
  const [logForm, setLogForm] = useState(emptyLog);

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['production-plan', planDate],
    queryFn: () => productionAPI.getPlan(planDate).then(r => r.data),
  });
  const { data: allJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['production-jobs'],
    queryFn: () => productionAPI.getJobs({}).then(r => r.data),
  });
  // For the manual "Log Production" form.
  const { data: orders } = useQuery({ queryKey: ['orders', 'all'], queryFn: () => ordersAPI.getAll().then(r => r.data) });
  const { data: machines } = useQuery({ queryKey: ['machines', 'active'], queryFn: () => machinesAPI.getAll(true).then(r => r.data) });
  const { data: inv } = useQuery({ queryKey: ['inventory', 'all'], queryFn: () => inventoryAPI.getAll().then(r => r.data), enabled: showLog });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['production-jobs'] });
    qc.invalidateQueries({ queryKey: ['production-plan'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    qc.invalidateQueries({ queryKey: ['inventory-stats'] });
    qc.invalidateQueries({ queryKey: ['orders'] });
  };

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => productionAPI.updateJob(id, data),
    onSuccess: () => { invalidate(); toast.success('Updated'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });
  const logMut = useMutation({
    mutationFn: productionAPI.logJob,
    onSuccess: () => { invalidate(); toast.success('Production logged'); setShowLog(false); setLogForm(emptyLog); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const submitLog = (e) => {
    e.preventDefault();
    if (!logForm.machine_id && !logForm.notes && !logForm.order_id) { toast.error('Pick at least an order, machine, or add a note'); return; }
    logMut.mutate({ ...logForm });
  };

  const logOrder = orders?.find(o => o._id === logForm.order_id);
  const machineSchedules = plan?.schedule ? Object.values(plan.schedule) : [];

  // Compact Start / End / status controls reused by mobile + desktop.
  const JobControls = ({ job }) => (
    <div className="flex flex-wrap items-center gap-1">
      {job.status === 'planned' && (
        <button onClick={() => updateMut.mutate({ id: job._id, data: { status: 'in_progress' } })} className="btn-secondary text-xs px-2 py-1">▶ Start</button>
      )}
      {job.status === 'in_progress' && (
        <button onClick={() => updateMut.mutate({ id: job._id, data: { status: 'completed' } })} className="btn-success text-xs px-2 py-1">⏹ End</button>
      )}
      <select className="select text-xs w-28" value={job.status} onChange={e => updateMut.mutate({ id: job._id, data: { status: e.target.value } })}>
        {['planned', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</option>)}
      </select>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Production Plan (उत्पादन)"
        subtitle="Daily production schedule by machine"
        actions={
          <div className="flex gap-2 items-center no-print">
            <button onClick={() => { setLogForm(emptyLog); setShowLog(true); }} className="btn-primary">➕ Log Production</button>
            <input type="date" className="input w-40" value={planDate} onChange={e => setPlanDate(e.target.value)} />
            <button onClick={() => window.print()} className="btn-secondary hidden sm:flex">🖨️ Print</button>
          </div>
        }
      />

      {/* Daily plan by machine */}
      <div className="space-y-4 mb-8">
        <h2 className="text-base font-semibold text-steel-700">
          {new Date(planDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        {planLoading && <div className="card text-center text-steel-400">Loading plan...</div>}
        {machineSchedules.length === 0 && !planLoading && (
          <div className="card text-center text-steel-400 py-12">No jobs scheduled — create orders and run optimization, or ➕ Log Production</div>
        )}
        {machineSchedules.map(machine => (
          <div key={machine.machine_id} className="card">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold">{machine.machine_name}{machine.shared_resource && <span className="ml-2 text-xs font-normal text-amber-600">⚠️ {machine.shared_resource}</span>}</h3>
                <div className="text-xs text-steel-500">
                  Available: {machine.available_hrs}h | Used: {machine.used_hrs}h |
                  <span className={machine.remaining_hrs < 2 ? ' text-red-500 font-medium' : ' text-green-600'}>
                    {' '}Left: {machine.remaining_hrs}h
                  </span>
                </div>
              </div>
              <div className="w-28 flex-shrink-0">
                <div className="h-2.5 bg-steel-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(machine.used_hrs / machine.available_hrs) > 0.9 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min((machine.used_hrs / machine.available_hrs) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {machine.jobs.length === 0 ? (
              <div className="text-sm text-steel-400 text-center py-4">No jobs today</div>
            ) : (
              <div className="space-y-2">
                {machine.jobs.map((job, ji) => (
                  <div key={ji} className={`p-3 rounded-lg border ${job.overflow ? 'border-red-200 bg-red-50' : 'border-steel-200 bg-steel-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm">{job.job_number}</span>
                          {job.priority === 'high' && <span className="badge-high">🔴 High</span>}
                          {job.overflow && <span className="text-xs text-red-500 font-medium">⚠️ Overflow</span>}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                        </div>
                        <div className="text-xs text-steel-500 mt-0.5 truncate">
                          {job.order_number}{isOwner && job.customer ? ` | ${job.customer}` : ''}
                          {job.deadline && ` | Due: ${new Date(job.deadline).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="text-right text-sm flex-shrink-0">
                        {job.setup_time_hrs > 0 && <div className="text-xs text-steel-400">Setup: {job.setup_time_hrs}h</div>}
                        {job.estimated_time_hrs > 0 && <div className="font-medium">{job.estimated_time_hrs.toFixed(1)}h</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* All Jobs — mobile cards */}
      <div className="md:hidden space-y-3">
        <h2 className="text-base font-semibold">All Cutting Jobs</h2>
        {jobsLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {allJobs?.length === 0 && <div className="card text-center text-steel-400 py-8">No jobs</div>}
        {allJobs?.map(job => (
          <div key={job._id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-medium">{job.job_number}{job.manual_entry && <span className="ml-1 text-xs text-steel-400">✍️ manual</span>}</div>
                {isOwner && <div className="text-xs text-steel-500">{job.order?.order_number || '—'}{job.order?.customer?.name ? ` · ${job.order.customer.name}` : ''}</div>}
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] || ''}`}>{job.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-steel-600 mb-2">
              <div><span className="text-xs text-steel-400">Machine</span><div>{job.machine?.name || '—'}</div></div>
              <div><span className="text-xs text-steel-400">Est / Actual</span><div>{job.estimated_time_hrs ? `${job.estimated_time_hrs.toFixed(1)}h` : '—'}{duration(job.actual_start, job.actual_end) ? ` / ${duration(job.actual_start, job.actual_end)}` : ''}</div></div>
              <div><span className="text-xs text-steel-400">Wastage</span><div className="text-orange-600">{job.wastage_pct ? `${job.wastage_pct.toFixed(1)}%` : '—'}</div></div>
              <div><span className="text-xs text-steel-400">Ended</span><div>{fmtTime(job.actual_end) || '—'}</div></div>
            </div>
            <JobControls job={job} />
          </div>
        ))}
      </div>

      {/* All Jobs — desktop table */}
      <div className="hidden md:block card">
        <h2 className="text-lg font-semibold mb-4">All Cutting Jobs</h2>
        {jobsLoading && <div className="text-center text-steel-400">Loading...</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-b border-steel-200">
              <tr>
                {['Job #', 'Order', ...(isOwner ? ['Customer'] : []), 'Machine', 'Status', 'Est.', 'Actual', 'Wastage', 'Controls'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {allJobs?.length === 0 && <tr><td colSpan={isOwner ? 10 : 9} className="px-4 py-8 text-center text-steel-400">No jobs</td></tr>}
              {allJobs?.map(job => (
                <tr key={job._id} className="hover:bg-steel-50">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{job.job_number}{job.manual_entry && <span className="ml-1 text-xs text-steel-400" title="Manually logged">✍️</span>}</td>
                  <td className="px-4 py-3">{job.order?.order_number || '—'}</td>
                  {isOwner && <td className="px-4 py-3">{job.order?.customer?.name || '—'}</td>}
                  <td className="px-4 py-3">{job.machine?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] || ''}`}>{job.status}</span>
                  </td>
                  <td className="px-4 py-3">{job.estimated_time_hrs ? `${job.estimated_time_hrs.toFixed(1)}h` : '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{duration(job.actual_start, job.actual_end) || (job.actual_start ? '▶ running' : '—')}</td>
                  <td className="px-4 py-3 text-orange-600">{job.wastage_pct ? `${job.wastage_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-3"><JobControls job={job} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Production modal (manual after-the-fact record) */}
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Log Production (मैनुअल)" size="lg">
        <form onSubmit={submitLog} className="space-y-4">
          <p className="text-xs text-steel-500">Record work that was done, even after the fact. Everything is optional — if you pick a stock item and a weight, that weight is deducted so inventory stays correct.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Order (optional)</label>
              <select className="select" value={logForm.order_id} onChange={e => setLogForm(f => ({ ...f, order_id: e.target.value, line_item_id: '' }))}>
                <option value="">— none —</option>
                {orders?.filter(o => o.status !== 'cancelled').map(o => (
                  <option key={o._id} value={o._id}>{o.order_number}{isOwner && o.customer?.name ? ` · ${o.customer.name}` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Size / line item (optional)</label>
              <select className="select" value={logForm.line_item_id} onChange={e => setLogForm(f => ({ ...f, line_item_id: e.target.value }))} disabled={!logOrder}>
                <option value="">— none —</option>
                {logOrder?.line_items?.map(li => (
                  <option key={li._id} value={li._id}>{li.width_mm}mm{li.length_mm ? `×${li.length_mm}` : ''} · {li.thickness_mm}mm · {HARDNESS_LABELS[li.hardness]} · {displayWeight(li.qty_kg)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Machine</label>
              <select className="select" value={logForm.machine_id} onChange={e => setLogForm(f => ({ ...f, machine_id: e.target.value }))}>
                <option value="">— none —</option>
                {machines?.map(m => <option key={m._id} value={m._id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="select" value={logForm.status} onChange={e => setLogForm(f => ({ ...f, status: e.target.value }))}>
                {['completed', 'in_progress', 'planned'].map(s => <option key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Stock used (optional)</label>
              <select className="select" value={logForm.inventory_id ? `${logForm.inventory_type}:${logForm.inventory_id}` : ''}
                onChange={e => { const [t, id] = e.target.value.split(':'); setLogForm(f => ({ ...f, inventory_id: id || '', inventory_type: t || 'coil' })); }}>
                <option value="">— none —</option>
                {inv?.coils?.map(c => <option key={c._id} value={`coil:${c._id}`}>🔩 {c.width_mm}×{c.gauge_mm}mm · {displayWeight(c.remaining_weight_kg)} left</option>)}
                {inv?.sheets?.map(s => <option key={s._id} value={`sheet:${s._id}`}>📄 {s.length_mm}×{s.width_mm}×{s.thickness_mm}mm · {displayWeight(s.remaining_weight_kg)} left</option>)}
              </select>
            </div>
            <div>
              <label className="label">Material used (kg)</label>
              <input type="number" step="0.001" min="0" className="input" value={logForm.material_weight_kg} onChange={e => setLogForm(f => ({ ...f, material_weight_kg: e.target.value }))} placeholder="deducted from stock if set" />
            </div>
            <div>
              <label className="label">Produced / output (kg)</label>
              <input type="number" step="0.001" min="0" className="input" value={logForm.output_kg} onChange={e => setLogForm(f => ({ ...f, output_kg: e.target.value }))} placeholder="credited to the order size" />
            </div>
            <div>
              <label className="label">Wastage (kg)</label>
              <input type="number" step="0.001" min="0" className="input" value={logForm.wastage_kg} onChange={e => setLogForm(f => ({ ...f, wastage_kg: e.target.value }))} />
            </div>
            <div>
              <label className="label">Scrap (kg)</label>
              <input type="number" step="0.001" min="0" className="input" value={logForm.scrap_kg} onChange={e => setLogForm(f => ({ ...f, scrap_kg: e.target.value }))} />
            </div>
            <div>
              <label className="label">Est. time (h)</label>
              <input type="number" step="0.1" min="0" className="input" value={logForm.estimated_time_hrs} onChange={e => setLogForm(f => ({ ...f, estimated_time_hrs: e.target.value }))} />
            </div>
            <div>
              <label className="label">Actual start</label>
              <input type="datetime-local" className="input" value={logForm.actual_start} onChange={e => setLogForm(f => ({ ...f, actual_start: e.target.value }))} />
            </div>
            <div>
              <label className="label">Actual end</label>
              <input type="datetime-local" className="input" value={logForm.actual_end} onChange={e => setLogForm(f => ({ ...f, actual_end: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={logForm.notes} onChange={e => setLogForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. run done yesterday evening on Slitter 1" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowLog(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={logMut.isPending}>{logMut.isPending ? 'Saving...' : 'Save Record'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
