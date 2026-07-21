import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryAPI, suppliersAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS, HARDNESS_COLORS, RUST_LEVELS, RUST_LABELS, RUST_COLORS } from '../utils/units';
import { exportToCsv, stampedName } from '../utils/exportCsv';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import UnitInput from '../components/UnitInput';
import { MoveModal, HistoryModal } from '../components/InventoryMovementModals';

const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest arrival first' },
  { value: 'date_asc', label: 'Oldest arrival first' },
  { value: 'weight_desc', label: 'Weight: high to low' },
  { value: 'weight_asc', label: 'Weight: low to high' },
];

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];

const EXPORT_COLUMNS = [
  { label: 'OD (mm)', value: c => c.od_mm },
  { label: 'ID (mm)', value: c => c.id_mm },
  { label: 'Width (mm)', value: c => c.width_mm },
  { label: 'Gauge (mm)', value: c => c.gauge_mm },
  { label: 'Hardness', value: c => HARDNESS_LABELS[c.hardness] || c.hardness },
  { label: 'Grade', value: c => c.grade?.replace('_', ' ') },
  { label: 'Rust', value: c => RUST_LABELS[c.rust_level] || c.rust_level },
  { label: 'Total Wt (kg)', value: c => c.weight_kg },
  { label: 'Remaining (kg)', value: c => c.remaining_weight_kg },
  { label: 'Supplier', value: c => c.supplier?.name || '' },
  { label: 'Purchase Date', value: c => (c.purchase_date ? new Date(c.purchase_date).toLocaleDateString() : '') },
];

function calcCoilWeight(od, id_, width) {
  if (!od || !id_ || !width) return 0;
  return (Math.PI / 4) * (od ** 2 - id_ ** 2) * width * 0.00786 / 1000;
}

const emptyForm = {
  od_mm: null, id_mm: null, width_mm: null, gauge_mm: null,
  hardness: 'soft', grade: 'grade_1', rust_level: 'prime',
  supplier: '', purchase_date: new Date().toISOString().slice(0, 10), notes: '',
  weight_kg: null, weight_manual: false,
};

export default function InventoryCoils() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState({ hardness: '', gauge_min: '', gauge_max: '', rust_level: '' });
  const [sort, setSort] = useState('date_desc');
  const [moveItem, setMoveItem] = useState(null);
  const [historyId, setHistoryId] = useState(null);

  const { data: rawInventory, isLoading } = useQuery({
    queryKey: ['inventory', 'coil', filter],
    queryFn: () => inventoryAPI.getAll({ type: 'coil', ...filter }).then(r => r.data.coils),
  });

  const inventory = useMemo(() => {
    if (!rawInventory) return rawInventory;
    const sorted = [...rawInventory];
    switch (sort) {
      case 'date_asc': sorted.sort((a, b) => new Date(a.purchase_date || a.createdAt) - new Date(b.purchase_date || b.createdAt)); break;
      case 'weight_desc': sorted.sort((a, b) => b.remaining_weight_kg - a.remaining_weight_kg); break;
      case 'weight_asc': sorted.sort((a, b) => a.remaining_weight_kg - b.remaining_weight_kg); break;
      default: sorted.sort((a, b) => new Date(b.purchase_date || b.createdAt) - new Date(a.purchase_date || a.createdAt));
    }
    return sorted;
  }, [rawInventory, sort]);

  const findBuyers = (coil) => navigate(`/customers?type=coil&width=${coil.width_mm}&gauge=${coil.gauge_mm}`);

  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersAPI.getAll().then(r => r.data) });

  const createMut = useMutation({
    mutationFn: inventoryAPI.createCoil,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Coil added'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.updateCoil(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Updated'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: inventoryAPI.deleteCoil,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Removed'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (coil) => {
    setEditing(coil._id);
    const auto = calcCoilWeight(coil.od_mm, coil.id_mm, coil.width_mm);
    const manual = coil.weight_kg && Math.abs(coil.weight_kg - auto) > 0.01;
    setForm({ ...coil, supplier: coil.supplier?._id || coil.supplier || '', purchase_date: coil.purchase_date?.slice(0, 10) || '', weight_manual: !!manual });
    setShowModal(true);
  };

  const estimatedWeight = calcCoilWeight(form.od_mm, form.id_mm, form.width_mm);
  const effectiveWeight = form.weight_manual ? (Number(form.weight_kg) || 0) : estimatedWeight;

  const handleSubmit = e => {
    e.preventDefault();
    const data = { ...form, weight_kg: effectiveWeight };
    if (!data.supplier) delete data.supplier;
    if (editing) updateMut.mutate({ id: editing, data });
    else createMut.mutate(data);
  };

  return (
    <div>
      <PageHeader
        title="Coil Inventory (माल)"
        subtitle={`${inventory?.length || 0} coils in stock`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => exportToCsv(stampedName('coils'), EXPORT_COLUMNS, inventory || [])} className="btn-secondary hidden sm:flex">⬇️ Excel</button>
            <button onClick={() => window.print()} className="btn-secondary hidden sm:flex">🖨️ Print</button>
            <button onClick={openAdd} className="btn-primary">+ Add Coil</button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-28">
            <label className="label">Hardness</label>
            <select className="select" value={filter.hardness} onChange={e => setFilter(f => ({ ...f, hardness: e.target.value }))}>
              <option value="">All</option>
              {HARDNESS_LIST.map(h => <option key={h} value={h}>{HARDNESS_LABELS[h]}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-28">
            <label className="label">Rust (जंग)</label>
            <select className="select" value={filter.rust_level} onChange={e => setFilter(f => ({ ...f, rust_level: e.target.value }))}>
              <option value="">All</option>
              {RUST_LEVELS.map(r => <option key={r} value={r}>{RUST_LABELS[r]}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-24">
            <label className="label">Gauge Min</label>
            <input type="number" className="input" step="0.01" value={filter.gauge_min} onChange={e => setFilter(f => ({ ...f, gauge_min: e.target.value }))} placeholder="mm" />
          </div>
          <div className="flex-1 min-w-24">
            <label className="label">Gauge Max</label>
            <input type="number" className="input" step="0.01" value={filter.gauge_max} onChange={e => setFilter(f => ({ ...f, gauge_max: e.target.value }))} placeholder="mm" />
          </div>
          <div className="flex-1 min-w-36">
            <label className="label">Sort</label>
            <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => setFilter({ hardness: '', gauge_min: '', gauge_max: '', rust_level: '' })} className="btn-secondary self-end">Clear</button>
        </div>
      </div>

      {/* Mobile cards / desktop table */}
      <div className="md:hidden space-y-3">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {inventory?.length === 0 && <div className="card text-center text-steel-400 py-8">No coils in stock</div>}
        {inventory?.map(coil => (
          <div key={coil._id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold">{coil.width_mm}mm wide × {coil.gauge_mm}mm gauge</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${HARDNESS_COLORS[coil.hardness]}`}>{HARDNESS_LABELS[coil.hardness]}</span>
                  {coil.rust_level && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RUST_COLORS[coil.rust_level]}`}>{RUST_LABELS[coil.rust_level]}</span>}
                </div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                <button onClick={() => findBuyers(coil)} className="btn-secondary px-2 py-1 text-xs">👥 Buyers</button>
                <button onClick={() => setMoveItem(coil)} className="btn-secondary px-2 py-1 text-xs">↕ Move</button>
                <button onClick={() => setHistoryId(coil._id)} className="btn-secondary px-2 py-1 text-xs">🕘</button>
                <button onClick={() => openEdit(coil)} className="btn-secondary px-2 py-1 text-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Remove?')) deleteMut.mutate(coil._id); }} className="btn-danger px-2 py-1 text-xs">Del</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-steel-600">
              <div><span className="text-xs text-steel-400">OD/ID</span><div>{coil.od_mm}/{coil.id_mm} mm</div></div>
              <div><span className="text-xs text-steel-400">Total Wt</span><div>{displayWeight(coil.weight_kg)}</div></div>
              <div>
                <span className="text-xs text-steel-400">Remaining</span>
                <div className="flex items-center gap-1">
                  {displayWeight(coil.remaining_weight_kg)}
                  <div className="w-12 h-1.5 bg-steel-200 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(coil.remaining_weight_kg / coil.weight_kg) * 100}%` }} /></div>
                </div>
              </div>
              {coil.supplier?.name && <div><span className="text-xs text-steel-400">Supplier</span><div>{coil.supplier.name}</div></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 border-b border-steel-200">
            <tr>
              {['OD', 'ID', 'Width', 'Gauge', 'Hardness', 'Grade', 'Rust', 'Total Wt', 'Remaining', 'Supplier', 'Date', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {isLoading ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-steel-400">Loading...</td></tr>
            ) : inventory?.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-steel-400">No coils in stock</td></tr>
            ) : inventory?.map(coil => (
              <tr key={coil._id} className="hover:bg-steel-50">
                <td className="px-4 py-3">{coil.od_mm} mm</td>
                <td className="px-4 py-3">{coil.id_mm} mm</td>
                <td className="px-4 py-3 font-medium">{coil.width_mm} mm</td>
                <td className="px-4 py-3 font-medium">{coil.gauge_mm} mm</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${HARDNESS_COLORS[coil.hardness]}`}>{HARDNESS_LABELS[coil.hardness]}</span></td>
                <td className="px-4 py-3 capitalize">{coil.grade?.replace('_', ' ')}</td>
                <td className="px-4 py-3">{coil.rust_level ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RUST_COLORS[coil.rust_level]}`}>{RUST_LABELS[coil.rust_level]}</span> : '—'}</td>
                <td className="px-4 py-3">{displayWeight(coil.weight_kg)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {displayWeight(coil.remaining_weight_kg)}
                    <div className="w-14 h-1.5 bg-steel-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(coil.remaining_weight_kg / coil.weight_kg) * 100}%` }} /></div>
                  </div>
                </td>
                <td className="px-4 py-3 text-steel-500">{coil.supplier?.name || '—'}</td>
                <td className="px-4 py-3 text-steel-500">{coil.purchase_date ? new Date(coil.purchase_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    <button onClick={() => findBuyers(coil)} className="btn-secondary px-2 py-1 text-xs" title="Find parties who buy this size">👥</button>
                    <button onClick={() => setMoveItem(coil)} className="btn-secondary px-2 py-1 text-xs" title="Move stock in/out">↕</button>
                    <button onClick={() => setHistoryId(coil._id)} className="btn-secondary px-2 py-1 text-xs" title="View history">🕘</button>
                    <button onClick={() => openEdit(coil)} className="btn-secondary px-2 py-1 text-xs">Edit</button>
                    <button onClick={() => { if (window.confirm('Remove?')) deleteMut.mutate(coil._id); }} className="btn-danger px-2 py-1 text-xs">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Coil' : 'Add Coil (माल जोड़ें)'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <UnitInput label="Outer Diameter (OD)" value_mm={form.od_mm} onChange={v => setForm(f => ({ ...f, od_mm: v }))} required />
            <UnitInput label="Inner Diameter (ID)" value_mm={form.id_mm} onChange={v => setForm(f => ({ ...f, id_mm: v }))} required />
            <UnitInput label="Width (चौड़ाई)" value_mm={form.width_mm} onChange={v => setForm(f => ({ ...f, width_mm: v }))} required />
            <UnitInput label="Gauge / Thickness (मोटाई)" value_mm={form.gauge_mm} onChange={v => setForm(f => ({ ...f, gauge_mm: v }))} required />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="label">Hardness</label>
              <select className="select" value={form.hardness} onChange={e => setForm(f => ({ ...f, hardness: e.target.value }))}>
                {HARDNESS_LIST.map(h => <option key={h} value={h}>{HARDNESS_LABELS[h]}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Grade</label>
              <select className="select" value={form.grade} onChange={e => setForm(f => ({ ...f, grade: e.target.value }))}>
                <option value="grade_1">Grade 1</option>
                <option value="grade_2">Grade 2</option>
              </select>
            </div>
            <div>
              <label className="label">Rust (जंग)</label>
              <select className="select" value={form.rust_level || 'prime'} onChange={e => setForm(f => ({ ...f, rust_level: e.target.value }))}>
                {RUST_LEVELS.map(r => <option key={r} value={r}>{RUST_LABELS[r]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Supplier</label>
              <select className="select" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}>
                <option value="">— Select —</option>
                {suppliers?.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Purchase Date</label>
              <input type="date" className="input" value={form.purchase_date} onChange={e => setForm(f => ({ ...f, purchase_date: e.target.value }))} />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <label className="label text-blue-800 mb-1">Weight (kg) — वज़न</label>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" className="input flex-1"
                value={form.weight_manual ? (form.weight_kg ?? '') : (estimatedWeight ? estimatedWeight.toFixed(3) : '')}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setForm(f => ({ ...f, weight_kg: v, weight_manual: true })); }}
                placeholder="auto from dimensions" />
              {form.weight_manual
                ? <button type="button" onClick={() => setForm(f => ({ ...f, weight_manual: false, weight_kg: null }))} className="btn-secondary text-xs whitespace-nowrap">↺ Auto</button>
                : <span className="text-xs text-blue-500 whitespace-nowrap">auto</span>}
            </div>
            <div className="text-blue-500 text-xs mt-1">{form.weight_manual ? '✏️ manual override' : '(π/4) × (OD² − ID²) × Width × 0.00786 — type to override'}</div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending || updateMut.isPending}>{editing ? 'Update' : 'Add Coil'}</button>
          </div>
        </form>
      </Modal>

      {moveItem && <MoveModal item={moveItem} kind="coil" onClose={() => setMoveItem(null)} />}
      {historyId && <HistoryModal itemId={historyId} kind="coil" onClose={() => setHistoryId(null)} />}
    </div>
  );
}
