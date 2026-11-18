import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS, RUST_LEVELS, RUST_LABELS } from '../utils/units';
import Modal from './Modal';

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];
const newRow = (from = {}) => ({
  key: Math.random().toString(36).slice(2),
  width: '', gauge: '', weight: '', count: '1', od: '', id: '',
  hardness: 'soft', grade: 'grade_1', rust: 'prime',
  ...from,
});

// Weight of a coil from its dimensions — same formula as the single Add Coil form.
const calcCoilWeight = (od, id, width) => (od > 0 && id > 0 && width > 0 ? (Math.PI / 4) * (od ** 2 - id ** 2) * width * 0.00786 / 1000 : 0);

// Add several coils in one go. Each row is one kind of coil; "number of coils" adds that many identical coils,
// each as its own record (so each one's remaining weight and history is tracked separately).
export default function BulkCoilsModal({ suppliers = [], onClose }) {
  const qc = useQueryClient();
  const [shared, setShared] = useState({ supplier: '', purchase_date: new Date().toISOString().slice(0, 10) });
  const [rows, setRows] = useState([newRow()]);

  const update = (key, patch) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)));
  const weightOf = r => (parseFloat(r.weight) > 0 ? parseFloat(r.weight) : calcCoilWeight(parseFloat(r.od), parseFloat(r.id), parseFloat(r.width)));
  const countOf = r => parseInt(r.count || '1', 10) || 0;

  const totalCoils = rows.reduce((s, r) => s + countOf(r), 0);
  const totalKg = rows.reduce((s, r) => s + weightOf(r) * countOf(r), 0);

  const saveMut = useMutation({
    mutationFn: inventoryAPI.createCoilsBulk,
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(`${res.data.count} coil${res.data.count === 1 ? '' : 's'} added — ${displayWeight(res.data.total_weight_kg)}`);
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const submit = e => {
    e.preventDefault();
    for (const [i, r] of rows.entries()) {
      if (!(parseFloat(r.width) > 0) || !(parseFloat(r.gauge) > 0)) { toast.error(`Row ${i + 1}: enter the width and gauge`); return; }
      if (!(weightOf(r) > 0)) { toast.error(`Row ${i + 1}: enter the weight of each coil (or OD + ID)`); return; }
      if (!(countOf(r) >= 1)) { toast.error(`Row ${i + 1}: number of coils must be 1 or more`); return; }
    }
    saveMut.mutate({
      ...(shared.supplier ? { supplier: shared.supplier } : {}),
      purchase_date: shared.purchase_date,
      coils: rows.map(r => ({
        width_mm: parseFloat(r.width), gauge_mm: parseFloat(r.gauge),
        ...(parseFloat(r.weight) > 0 ? { weight_kg: parseFloat(r.weight) } : {}),
        ...(parseFloat(r.od) > 0 && parseFloat(r.id) > 0 ? { od_mm: parseFloat(r.od), id_mm: parseFloat(r.id) } : {}),
        hardness: r.hardness, grade: r.grade, rust_level: r.rust, count: countOf(r),
      })),
    });
  };

  return (
    <Modal open onClose={onClose} title="Add Several Coils (कई माल जोड़ें)" size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Supplier (for all)</label>
            <select className="select" value={shared.supplier} onChange={e => setShared(s => ({ ...s, supplier: e.target.value }))}>
              <option value="">— Select —</option>
              {suppliers.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Purchase Date (for all)</label>
            <input type="date" className="input" value={shared.purchase_date} onChange={e => setShared(s => ({ ...s, purchase_date: e.target.value }))} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Coils</label>
            <button type="button" onClick={() => setRows(rs => [...rs, newRow()])} className="btn-secondary btn-xs">+ Add Row</button>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="mb-3 p-3 bg-steel-50 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-steel-700">Row {i + 1}{countOf(r) > 1 ? ` — ${countOf(r)} identical coils` : ''}</div>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => setRows(rs => { const at = rs.findIndex(x => x.key === r.key); const copy = [...rs]; copy.splice(at + 1, 0, newRow({ ...r, key: undefined })); return copy; })} className="btn-secondary btn-xs">Copy row</button>
                  {rows.length > 1 && <button type="button" onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))} className="btn-danger btn-xs" aria-label={`Remove row ${i + 1}`}>✕</button>}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-sm text-steel-600">Width (mm) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.1" className="input" value={r.width} onChange={e => update(r.key, { width: e.target.value })} placeholder="e.g. 500" />
                </div>
                <div>
                  <label className="text-sm text-steel-600">Gauge (mm) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" className="input" value={r.gauge} onChange={e => update(r.key, { gauge: e.target.value })} placeholder="e.g. 2" />
                </div>
                <div>
                  <label className="text-sm text-steel-600">Weight of each (kg) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.001" min="0" className="input" value={r.weight} onChange={e => update(r.key, { weight: e.target.value })} placeholder={!(parseFloat(r.weight) > 0) && weightOf(r) > 0 ? `auto ${weightOf(r).toFixed(1)}` : 'kg'} />
                </div>
                <div>
                  <label className="text-sm text-steel-600">Number of coils</label>
                  <input type="number" step="1" min="1" className="input" value={r.count} onChange={e => update(r.key, { count: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-sm text-steel-600">Hardness</label>
                  <select className="select" value={r.hardness} onChange={e => update(r.key, { hardness: e.target.value })}>
                    {HARDNESS_LIST.map(h => <option key={h} value={h}>{HARDNESS_LABELS[h]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm text-steel-600">Grade</label>
                  <select className="select" value={r.grade} onChange={e => update(r.key, { grade: e.target.value })}>
                    <option value="grade_1">Grade 1</option>
                    <option value="grade_2">Grade 2</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-steel-600">Rust (जंग)</label>
                  <select className="select" value={r.rust} onChange={e => update(r.key, { rust: e.target.value })}>
                    {RUST_LEVELS.map(x => <option key={x} value={x}>{RUST_LABELS[x]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-sm text-steel-600">OD (mm) — optional</label>
                  <input type="number" step="0.1" className="input" value={r.od} onChange={e => update(r.key, { od: e.target.value })} placeholder="only to calculate weight" />
                </div>
                <div>
                  <label className="text-sm text-steel-600">ID (mm) — optional</label>
                  <input type="number" step="0.1" className="input" value={r.id} onChange={e => update(r.key, { id: e.target.value })} placeholder="only to calculate weight" />
                </div>
              </div>
            </div>
          ))}
          <div className="text-right font-semibold" data-testid="bulk-total">Total: {totalCoils} coil{totalCoils === 1 ? '' : 's'} · {displayWeight(totalKg)}</div>
          <div className="text-sm text-steel-500">Every coil is saved as its own entry. "Copy row" is handy for a similar coil with a small difference.</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : `Add ${totalCoils} Coil${totalCoils === 1 ? '' : 's'}`}</button>
        </div>
      </form>
    </Modal>
  );
}
