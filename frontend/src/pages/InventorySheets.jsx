import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryAPI, suppliersAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS, HARDNESS_COLORS, SHEET_PRESETS, RUST_LEVELS, RUST_LABELS, RUST_COLORS } from '../utils/units';
import { exportToCsv, stampedName } from '../utils/exportCsv';
import { exportPdf } from '../utils/exportPdf';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { MoveModal, HistoryModal } from '../components/InventoryMovementModals';

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];
const SORT_OPTIONS = [
  { value: 'date_desc', label: 'Newest arrival first' },
  { value: 'date_asc', label: 'Oldest arrival first' },
  { value: 'weight_desc', label: 'Weight: high to low' },
  { value: 'weight_asc', label: 'Weight: low to high' },
];

const EXPORT_COLUMNS = [
  { label: 'Format', value: s => (s.format_preset !== 'custom' ? s.format_preset : 'custom') },
  { label: 'Length (mm)', value: s => s.length_mm },
  { label: 'Width (mm)', value: s => s.width_mm },
  { label: 'Thickness (mm)', value: s => s.thickness_mm },
  { label: 'Hardness', value: s => HARDNESS_LABELS[s.hardness] || s.hardness },
  { label: 'Rust', value: s => RUST_LABELS[s.rust_level] || s.rust_level },
  { label: 'Quantity', value: s => s.quantity },
  { label: 'Wt/Sheet (kg)', value: s => s.weight_per_sheet_kg },
  { label: 'Total Wt (kg)', value: s => s.weight_kg },
  { label: 'Remaining (kg)', value: s => s.remaining_weight_kg },
  { label: 'Supplier', value: s => s.supplier?.name || '' },
  { label: 'Purchase Date', value: s => (s.purchase_date ? new Date(s.purchase_date).toLocaleDateString() : '') },
];
const emptyForm = {
  length_mm: null, width_mm: null, thickness_mm: null,
  hardness: 'soft', grade: 'grade_1', rust_level: 'prime', format_preset: 'custom',
  quantity: 1, supplier: '',
  purchase_date: new Date().toISOString().slice(0, 10), notes: '',
  weight_kg: null, weight_manual: false,
};

function calcSheetWeight(l, w, t) {
  if (!l || !w || !t) return 0;
  return (l * w * t * 7.86) / 1e6;
}

export default function InventorySheets() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState({ hardness: '', rust_level: '' });
  const [sort, setSort] = useState('date_desc');
  const [moveItem, setMoveItem] = useState(null);
  const [historyId, setHistoryId] = useState(null);

  const { data: rawInventory, isLoading } = useQuery({
    queryKey: ['inventory', 'sheet', filter],
    queryFn: () => inventoryAPI.getAll({ type: 'sheet', ...filter }).then(r => r.data.sheets),
  });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: () => suppliersAPI.getAll().then(r => r.data) });

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

  const findBuyers = (sheet) => navigate(`/customers?type=sheet&width=${sheet.width_mm}&gauge=${sheet.thickness_mm}&length=${sheet.length_mm}`);

  const createMut = useMutation({
    mutationFn: inventoryAPI.createSheet,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Sheet added'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }) => inventoryAPI.updateSheet(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Updated'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });
  const deleteMut = useMutation({
    mutationFn: inventoryAPI.deleteSheet,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['inventory-stats'] }); toast.success('Removed'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (sheet) => {
    setEditing(sheet._id);
    const auto = calcSheetWeight(sheet.length_mm, sheet.width_mm, sheet.thickness_mm) * (sheet.quantity || 1);
    const manual = sheet.weight_kg && Math.abs(sheet.weight_kg - auto) > 0.01;
    setForm({ ...sheet, supplier: sheet.supplier?._id || sheet.supplier || '', purchase_date: sheet.purchase_date?.slice(0, 10) || '', weight_manual: !!manual });
    setShowModal(true);
  };

  const handlePreset = e => {
    const preset = SHEET_PRESETS.find(p => p.value === e.target.value);
    if (preset?.length) setForm(f => ({ ...f, format_preset: preset.value, length_mm: preset.length, width_mm: preset.width }));
    else setForm(f => ({ ...f, format_preset: 'custom' }));
  };

  const wpSheet = calcSheetWeight(form.length_mm, form.width_mm, form.thickness_mm);
  const computedTotal = wpSheet * (form.quantity || 1);
  const effectiveTotal = form.weight_manual ? (Number(form.weight_kg) || 0) : computedTotal;
  const effectivePer = (form.quantity || 1) > 0 ? effectiveTotal / (form.quantity || 1) : effectiveTotal;

  const handleSubmit = e => {
    e.preventDefault();
    const data = { ...form, weight_kg: effectiveTotal };
    if (!data.supplier) delete data.supplier;
    if (editing) updateMut.mutate({ id: editing, data });
    else createMut.mutate(data);
  };

  return (
    <div>
      <PageHeader
        title="Sheet Inventory (पत्र)"
        subtitle={`${inventory?.length || 0} sheet types in stock`}
        actions={
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => exportToCsv(stampedName('sheets'), EXPORT_COLUMNS, inventory || [])} className="btn-secondary">⬇️ Excel</button>
            <button onClick={() => exportPdf({ title: 'Sheet Inventory (पत्र)', subtitle: `${inventory?.length || 0} sheet types in stock`, columns: EXPORT_COLUMNS, rows: inventory || [], landscape: true })} className="btn-secondary">📄 PDF</button>
            <button onClick={openAdd} className="btn-primary">+ Add Sheet</button>
          </div>
        }
      />

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
          <div className="flex-1 min-w-36">
            <label className="label">Sort</label>
            <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
              {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <button onClick={() => setFilter({ hardness: '', rust_level: '' })} className="btn-secondary self-end">Clear</button>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {inventory?.length === 0 && <div className="card text-center text-steel-400 py-8">No sheets in stock</div>}
        {inventory?.map(sheet => (
          <div key={sheet._id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-semibold">{sheet.length_mm}×{sheet.width_mm}mm {sheet.format_preset !== 'custom' ? `(${sheet.format_preset})` : ''}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${HARDNESS_COLORS[sheet.hardness]}`}>{HARDNESS_LABELS[sheet.hardness]}</span>
                  {sheet.rust_level && <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RUST_COLORS[sheet.rust_level]}`}>{RUST_LABELS[sheet.rust_level]}</span>}
                  <span className="text-xs text-steel-500">{sheet.thickness_mm}mm</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end">
                <button onClick={() => findBuyers(sheet)} className="btn-secondary btn-xs">👥 Buyers</button>
                <button onClick={() => setMoveItem(sheet)} className="btn-secondary btn-xs">↕ Move</button>
                <button onClick={() => setHistoryId(sheet._id)} className="btn-secondary btn-xs" aria-label="View history">🕘 History</button>
                <button onClick={() => openEdit(sheet)} className="btn-secondary btn-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Remove?')) deleteMut.mutate(sheet._id); }} className="btn-danger btn-xs">Del</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-steel-600">
              <div><span className="text-sm text-steel-500">Qty</span><div className="font-medium text-steel-900">{sheet.quantity} sheets</div></div>
              <div><span className="text-sm text-steel-500">Wt/sheet</span><div className="font-medium text-steel-900">{displayWeight(sheet.weight_per_sheet_kg)}</div></div>
              <div>
                <span className="text-sm text-steel-500">Remaining</span>
                <div className="flex items-center gap-1 font-medium text-steel-900">
                  {displayWeight(sheet.remaining_weight_kg)}
                  <div className="w-10 h-1.5 bg-steel-200 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(sheet.remaining_weight_kg / sheet.weight_kg) * 100}%` }} /></div>
                </div>
              </div>
              {sheet.supplier?.name && <div><span className="text-sm text-steel-500">Supplier</span><div className="font-medium text-steel-900">{sheet.supplier.name}</div></div>}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-steel-50 border-b border-steel-200">
            <tr>
              {['Format', 'Length', 'Width', 'Thickness', 'Hardness', 'Rust', 'Qty', 'Wt/Sheet', 'Total', 'Remaining', 'Supplier', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-steel-100">
            {isLoading ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-steel-400">Loading...</td></tr>
            ) : inventory?.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-steel-400">No sheets in stock</td></tr>
            ) : inventory?.map(sheet => (
              <tr key={sheet._id} className="hover:bg-steel-50">
                <td className="px-4 py-3 font-medium">{sheet.format_preset !== 'custom' ? sheet.format_preset : '—'}</td>
                <td className="px-4 py-3">{sheet.length_mm}mm</td>
                <td className="px-4 py-3">{sheet.width_mm}mm</td>
                <td className="px-4 py-3">{sheet.thickness_mm}mm</td>
                <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${HARDNESS_COLORS[sheet.hardness]}`}>{HARDNESS_LABELS[sheet.hardness]}</span></td>
                <td className="px-4 py-3">{sheet.rust_level ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${RUST_COLORS[sheet.rust_level]}`}>{RUST_LABELS[sheet.rust_level]}</span> : '—'}</td>
                <td className="px-4 py-3">{sheet.quantity}</td>
                <td className="px-4 py-3">{displayWeight(sheet.weight_per_sheet_kg)}</td>
                <td className="px-4 py-3">{displayWeight(sheet.weight_kg)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {displayWeight(sheet.remaining_weight_kg)}
                    <div className="w-10 h-1.5 bg-steel-200 rounded-full"><div className="h-full bg-green-500 rounded-full" style={{ width: `${(sheet.remaining_weight_kg / sheet.weight_kg) * 100}%` }} /></div>
                  </div>
                </td>
                <td className="px-4 py-3 text-steel-500">{sheet.supplier?.name || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => findBuyers(sheet)} className="btn-secondary btn-xs" title="Find parties who buy this size" aria-label="Find buyers for this size">👥</button>
                    <button onClick={() => setMoveItem(sheet)} className="btn-secondary btn-xs" title="Move stock in/out" aria-label="Move stock in or out">↕</button>
                    <button onClick={() => setHistoryId(sheet._id)} className="btn-secondary btn-xs" title="View history" aria-label="View change history">🕘</button>
                    <button onClick={() => openEdit(sheet)} className="btn-secondary btn-xs">Edit</button>
                    <button onClick={() => { if (window.confirm('Remove?')) deleteMut.mutate(sheet._id); }} className="btn-danger btn-xs">Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Sheet' : 'Add Sheet (पत्र जोड़ें)'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Format Preset</label>
            <select className="select" value={form.format_preset} onChange={handlePreset}>
              {SHEET_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-steel-600">Length — mm <span className="text-red-500">*</span></label>
              <input type="number" className="input" step="0.1" value={form.length_mm ?? ''} onChange={e => setForm(f => ({ ...f, length_mm: e.target.value === '' ? null : parseFloat(e.target.value) }))} required placeholder="e.g. 2500" />
            </div>
            <div>
              <label className="text-sm text-steel-600">Width (चौड़ाई) — mm <span className="text-red-500">*</span></label>
              <input type="number" className="input" step="0.1" value={form.width_mm ?? ''} onChange={e => setForm(f => ({ ...f, width_mm: e.target.value === '' ? null : parseFloat(e.target.value) }))} required placeholder="e.g. 900" />
            </div>
            <div>
              <label className="text-sm text-steel-600">Thickness (मोटाई) — mm <span className="text-red-500">*</span></label>
              <input type="number" className="input" step="0.01" value={form.thickness_mm ?? ''} onChange={e => setForm(f => ({ ...f, thickness_mm: e.target.value === '' ? null : parseFloat(e.target.value) }))} required placeholder="e.g. 5" />
            </div>
            <div>
              <label className="text-sm text-steel-600">Quantity</label>
              <input type="number" className="input" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: parseInt(e.target.value) || 1 }))} />
            </div>
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
            <label className="label text-blue-800 mb-1">Total Weight (kg) — कुल वज़न</label>
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" className="input flex-1"
                value={form.weight_manual ? (form.weight_kg ?? '') : (computedTotal ? computedTotal.toFixed(3) : '')}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d*$/.test(v)) setForm(f => ({ ...f, weight_kg: v, weight_manual: true })); }}
                placeholder="auto from dimensions" />
              {form.weight_manual
                ? <button type="button" onClick={() => setForm(f => ({ ...f, weight_manual: false, weight_kg: null }))} className="btn-secondary btn-xs whitespace-nowrap">↺ Auto</button>
                : <span className="text-sm text-blue-600 whitespace-nowrap">auto</span>}
            </div>
            <div className="text-blue-600 text-sm mt-1">Per sheet {displayWeight(effectivePer)} × {form.quantity || 1}{form.weight_manual ? ' · ✏️ manual override' : ' — type to override'}</div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending || updateMut.isPending}>{editing ? 'Update' : 'Add Sheet'}</button>
          </div>
        </form>
      </Modal>

      {moveItem && <MoveModal item={moveItem} kind="sheet" onClose={() => setMoveItem(null)} />}
      {historyId && <HistoryModal itemId={historyId} kind="sheet" onClose={() => setHistoryId(null)} />}
    </div>
  );
}
