import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { machinesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];
const HARDNESS_LABELS = { soft: 'Soft', semi_soft: 'Semi-Soft', medium: 'Medium', medium_hard: 'Med.Hard', hard: 'Hard' };

const emptyMachine = {
  name: '', type: 'slitter', status: 'active',
  width_min_mm: '', width_max_mm: '',
  thickness_ranges: HARDNESS_LIST.map(h => ({ hardness: h, min_mm: '', max_mm: '' })),
  speed_tiers: [{ gauge_min: '', gauge_max: '', base_time_hrs_per_ton: '' }],
  cut_baseline: 2, small_cut_mm: 17, small_cut_factor: 1.3,
  setup_change_hrs: 1.5, notes: '',
};

export default function MachinesPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyMachine);
  const [expandedId, setExpandedId] = useState(null);

  const { data: machines, isLoading } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesAPI.getAll().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: machinesAPI.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); toast.success('Machine added'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => machinesAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); toast.success('Updated'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const toggleMut = useMutation({
    mutationFn: machinesAPI.toggle,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['machines'] }); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const openAdd = () => { setEditing(null); setForm(emptyMachine); setShowModal(true); };
  const openEdit = (m) => {
    setEditing(m._id);
    // Fill in missing thickness ranges
    const existingRanges = HARDNESS_LIST.map(h => {
      const found = m.thickness_ranges?.find(r => r.hardness === h);
      return found || { hardness: h, min_mm: '', max_mm: '' };
    });
    setForm({ ...m, thickness_ranges: existingRanges });
    setShowModal(true);
  };

  const handleSubmit = e => {
    e.preventDefault();
    const data = {
      ...form,
      thickness_ranges: form.thickness_ranges.filter(r => r.min_mm !== '' && r.max_mm !== ''),
      speed_tiers: form.speed_tiers.filter(t => t.gauge_min !== '' && t.gauge_max !== '' && t.base_time_hrs_per_ton !== ''),
    };
    if (editing) updateMut.mutate({ id: editing, data });
    else createMut.mutate(data);
  };

  const addSpeedTier = () => setForm(f => ({ ...f, speed_tiers: [...f.speed_tiers, { gauge_min: '', gauge_max: '', base_time_hrs_per_ton: '' }] }));
  const removeSpeedTier = (i) => setForm(f => ({ ...f, speed_tiers: f.speed_tiers.filter((_, idx) => idx !== i) }));

  return (
    <div>
      <PageHeader
        title="Machines (मशीन)"
        subtitle="Configure machines used in production"
        actions={isOwner && <button onClick={openAdd} className="btn-primary">+ Add Machine</button>}
      />

      <div className="space-y-4">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {machines?.map(machine => (
          <div key={machine._id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{machine.name}</h3>
                  <span className={`badge-${machine.status}`}>{machine.status}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-steel-100 text-steel-700 capitalize">{machine.type}</span>
                </div>
                <div className="text-xs text-steel-500 mt-0.5">
                  Width: {machine.width_min_mm}–{machine.width_max_mm} mm | Setup: {machine.setup_change_hrs}h | {machine.speed_tiers?.length || 0} tiers
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button onClick={() => setExpandedId(expandedId === machine._id ? null : machine._id)} className="btn-secondary text-xs">
                  {expandedId === machine._id ? 'Hide' : 'Details'}
                </button>
                {isOwner && (
                  <>
                    <button onClick={() => openEdit(machine)} className="btn-secondary text-xs">Edit</button>
                    <button onClick={() => toggleMut.mutate(machine._id)} className={`text-xs btn ${machine.status === 'active' ? 'btn-danger' : 'btn-success'}`}>
                      {machine.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {expandedId === machine._id && (
              <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-steel-100 pt-4">
                <div>
                  <h4 className="text-sm font-semibold text-steel-700 mb-2">Thickness Ranges by Hardness (मोटाई)</h4>
                  <table className="text-xs w-full border border-steel-200 rounded">
                    <thead className="bg-steel-50"><tr><th className="px-3 py-1.5 text-left">Hardness</th><th className="px-3 py-1.5">Min mm</th><th className="px-3 py-1.5">Max mm</th></tr></thead>
                    <tbody>
                      {machine.thickness_ranges?.map(r => (
                        <tr key={r.hardness} className="border-t border-steel-100">
                          <td className="px-3 py-1.5">{HARDNESS_LABELS[r.hardness]}</td>
                          <td className="px-3 py-1.5 text-center">{r.min_mm}</td>
                          <td className="px-3 py-1.5 text-center">{r.max_mm}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-steel-700 mb-2">Speed Tiers (Speed by Gauge)</h4>
                  <table className="text-xs w-full border border-steel-200 rounded">
                    <thead className="bg-steel-50"><tr><th className="px-3 py-1.5 text-left">Gauge Range</th><th className="px-3 py-1.5">Hrs/Ton (at {machine.cut_baseline || 2} cuts)</th></tr></thead>
                    <tbody>
                      {machine.speed_tiers?.map((t, i) => (
                        <tr key={i} className="border-t border-steel-100">
                          <td className="px-3 py-1.5">{t.gauge_min} – {t.gauge_max} mm</td>
                          <td className="px-3 py-1.5 text-center">{t.base_time_hrs_per_ton} h/T</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {machine.type === 'slitter' && (
                    <div className="text-xs text-steel-500 mt-2">Small cut (&lt;{machine.small_cut_mm}mm): ×{machine.small_cut_factor} factor</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Machine' : 'Add Machine'} size="xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Machine Name <span className="text-red-500">*</span></label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Slitter 1" />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                <option value="slitter">Slitter</option>
                <option value="shear">Shearing Machine</option>
                <option value="ctl">CTL Line</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Width Min (mm)</label>
              <input type="number" className="input" value={form.width_min_mm} onChange={e => setForm(f => ({ ...f, width_min_mm: e.target.value }))} step="0.1" required />
            </div>
            <div>
              <label className="label">Width Max (mm)</label>
              <input type="number" className="input" value={form.width_max_mm} onChange={e => setForm(f => ({ ...f, width_max_mm: e.target.value }))} step="0.1" required />
            </div>
            <div>
              <label className="label">Setup Change (hrs)</label>
              <input type="number" className="input" value={form.setup_change_hrs} onChange={e => setForm(f => ({ ...f, setup_change_hrs: parseFloat(e.target.value) }))} step="0.25" />
            </div>
          </div>

          {form.type === 'slitter' && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="label">Cut Baseline</label>
                <input type="number" className="input" value={form.cut_baseline} onChange={e => setForm(f => ({ ...f, cut_baseline: parseInt(e.target.value) }))} />
              </div>
              <div>
                <label className="label">Small Cut Threshold (mm)</label>
                <input type="number" className="input" value={form.small_cut_mm} onChange={e => setForm(f => ({ ...f, small_cut_mm: parseFloat(e.target.value) }))} step="0.5" />
              </div>
              <div>
                <label className="label">Small Cut Factor</label>
                <input type="number" className="input" value={form.small_cut_factor} onChange={e => setForm(f => ({ ...f, small_cut_factor: parseFloat(e.target.value) }))} step="0.1" />
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold text-steel-700 mb-2">Thickness Ranges by Hardness</h4>
            <div className="border border-steel-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-steel-50"><tr><th className="px-3 py-2 text-left">Hardness</th><th className="px-3 py-2">Min (mm)</th><th className="px-3 py-2">Max (mm)</th></tr></thead>
                <tbody>
                  {form.thickness_ranges.map((r, i) => (
                    <tr key={r.hardness} className="border-t border-steel-100">
                      <td className="px-3 py-2 font-medium">{HARDNESS_LABELS[r.hardness]}</td>
                      <td className="px-3 py-2"><input type="number" className="input w-24" step="0.01" value={r.min_mm} onChange={e => { const tr = [...form.thickness_ranges]; tr[i] = { ...tr[i], min_mm: e.target.value }; setForm(f => ({ ...f, thickness_ranges: tr })); }} placeholder="0.30" /></td>
                      <td className="px-3 py-2"><input type="number" className="input w-24" step="0.01" value={r.max_mm} onChange={e => { const tr = [...form.thickness_ranges]; tr[i] = { ...tr[i], max_mm: e.target.value }; setForm(f => ({ ...f, thickness_ranges: tr })); }} placeholder="3.00" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-steel-700">Speed Tiers</h4>
              <button type="button" onClick={addSpeedTier} className="btn-secondary text-xs">+ Add Tier</button>
            </div>
            <div className="space-y-2">
              {form.speed_tiers.map((tier, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input type="number" className="input flex-1" step="0.01" placeholder="Gauge min" value={tier.gauge_min} onChange={e => { const ts = [...form.speed_tiers]; ts[i] = { ...ts[i], gauge_min: e.target.value }; setForm(f => ({ ...f, speed_tiers: ts })); }} />
                  <span className="text-steel-400 text-sm">–</span>
                  <input type="number" className="input flex-1" step="0.01" placeholder="Gauge max" value={tier.gauge_max} onChange={e => { const ts = [...form.speed_tiers]; ts[i] = { ...ts[i], gauge_max: e.target.value }; setForm(f => ({ ...f, speed_tiers: ts })); }} />
                  <input type="number" className="input flex-1" step="0.001" placeholder="Hrs/Ton" value={tier.base_time_hrs_per_ton} onChange={e => { const ts = [...form.speed_tiers]; ts[i] = { ...ts[i], base_time_hrs_per_ton: e.target.value }; setForm(f => ({ ...f, speed_tiers: ts })); }} />
                  <button type="button" onClick={() => removeSpeedTier(i)} className="btn-danger px-2 py-1 text-xs">×</button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending || updateMut.isPending}>
              {editing ? 'Update Machine' : 'Add Machine'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
