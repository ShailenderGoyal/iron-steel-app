import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { salesAPI, customersAPI, inventoryAPI, settingsAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS, RUST_LABELS } from '../utils/units';
import { exportToCsv } from '../utils/exportCsv';
import { exportPdf } from '../utils/exportPdf';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';

const today = () => new Date().toISOString().slice(0, 10);
const round3 = n => Math.round(n * 1000) / 1000;
const newLine = (ref = '') => ({ key: Math.random().toString(36).slice(2), ref, weight: '', pieces: '', cut: '', strips: '1', leftoverKg: '', restock: true });
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const sizeOf = it => (it.item_type === 'sheet'
  ? `${it.length_mm} × ${it.width_mm} × ${it.thickness_mm}mm`
  : `${it.width_mm}mm × ${it.thickness_mm}mm`);

// What happened to the strip left over after slitting a coil ('' for an uncut line).
const leftoverText = it => {
  if (!it.strips || !it.leftover_width_mm) return '';
  return it.leftover_coil ? `${it.leftover_width_mm}mm strip (${it.leftover_weight_kg} kg) back in stock` : `${it.leftover_width_mm}mm strip (${it.leftover_weight_kg} kg) scrap`;
};

const EXPORT_COLUMNS = [
  { label: 'Date', value: r => fmtDate(r.sale.sale_date) },
  { label: 'Bill No', value: r => r.sale.bill_no },
  { label: 'Party', value: r => r.sale.customer?.name },
  { label: 'Vehicle', value: r => r.sale.vehicle_no },
  { label: 'Type', value: r => (r.item.item_type === 'sheet' ? 'Sheet' : 'Coil') },
  { label: 'Size', value: r => sizeOf(r.item) },
  { label: 'Cut from width (mm)', value: r => r.item.source_width_mm },
  { label: 'Strips', value: r => r.item.strips },
  { label: 'Leftover', value: r => leftoverText(r.item) },
  { label: 'Hardness', value: r => HARDNESS_LABELS[r.item.hardness] || r.item.hardness },
  { label: 'Pieces', value: r => r.item.pieces },
  { label: 'Weight (kg)', value: r => r.item.weight_kg },
  { label: 'Status', value: r => (r.sale.status === 'cancelled' ? 'Cancelled' : 'Sold') },
];

export default function SalesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState({ customer: params.get('party') || '', from: '', to: '' });
  const [formOpen, setFormOpen] = useState(!!(params.get('sell') || params.get('new')));
  const [presetItem, setPresetItem] = useState(params.get('sell') || '');

  // The "?sell=" / "?new=" links (inventory rows, dashboard) only need to open the form once.
  useEffect(() => {
    if (params.get('sell') || params.get('new')) {
      const next = new URLSearchParams(params);
      next.delete('sell');
      next.delete('new');
      setParams(next, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: sales, isLoading } = useQuery({
    queryKey: ['sales', filter],
    queryFn: () => salesAPI.getAll(Object.fromEntries(Object.entries(filter).filter(([, v]) => v))).then(r => r.data),
  });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => customersAPI.getAll().then(r => r.data) });

  const cancelMut = useMutation({
    mutationFn: salesAPI.cancel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success('Sale cancelled — stock put back');
    },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const partyOptions = useMemo(() => (customers || []).map(c => ({ value: c._id, label: c.name })), [customers]);

  const active = (sales || []).filter(s => s.status === 'active');
  const totalKg = active.reduce((s, x) => s + x.total_weight_kg, 0);
  const exportRows = (sales || []).flatMap(sale => sale.items.map(item => ({ sale, item })));

  const setFilterKey = (k, v) => {
    setFilter(f => ({ ...f, [k]: v }));
    if (k === 'customer') setParams(v ? { party: v } : {}, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Sales (बिक्री)"
        subtitle={`${active.length} sale${active.length === 1 ? '' : 's'} · ${displayWeight(totalKg)} sold`}
        actions={
          <>
            <button onClick={() => exportToCsv(`sales_${today()}.csv`, EXPORT_COLUMNS, exportRows)} className="btn-secondary" disabled={!exportRows.length}>⬇️ Excel</button>
            <button onClick={() => exportPdf({ title: 'Sales', subtitle: `${active.length} sales — ${displayWeight(totalKg)} sold`, columns: EXPORT_COLUMNS, rows: exportRows, landscape: true })} className="btn-secondary" disabled={!exportRows.length}>📄 PDF</button>
            <button onClick={() => { setPresetItem(''); setFormOpen(true); }} className="btn-primary">+ New Sale</button>
          </>
        }
      />

      <div className="card mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-48">
            <label className="label">Party</label>
            <SearchableSelect options={[{ value: '', label: 'All parties' }, ...partyOptions]} value={filter.customer} onChange={v => setFilterKey('customer', v)} placeholder="All parties" />
          </div>
          <div className="flex-1 min-w-36">
            <label className="label">From</label>
            <input type="date" className="input" value={filter.from} onChange={e => setFilterKey('from', e.target.value)} />
          </div>
          <div className="flex-1 min-w-36">
            <label className="label">To</label>
            <input type="date" className="input" value={filter.to} onChange={e => setFilterKey('to', e.target.value)} />
          </div>
          <button onClick={() => { setFilter({ customer: '', from: '', to: '' }); setParams({}, { replace: true }); }} className="btn-secondary self-end">Clear</button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {sales?.length === 0 && <div className="card text-center text-steel-400 py-12">No sales recorded yet</div>}
        {sales?.map(sale => {
          const cancelled = sale.status === 'cancelled';
          return (
            <div key={sale._id} className={`card ${cancelled ? 'bg-steel-50 opacity-75' : ''}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold text-lg">{sale.customer?.name || 'Unknown party'}</div>
                  <div className="text-sm text-steel-500">
                    {fmtDate(sale.sale_date)}
                    {sale.bill_no && <> · Bill {sale.bill_no}</>}
                    {sale.vehicle_no && <> · 🚚 {sale.vehicle_no}</>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-semibold ${cancelled ? 'line-through text-steel-500' : ''}`}>{displayWeight(sale.total_weight_kg)}</div>
                  {cancelled && <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Cancelled</span>}
                </div>
              </div>
              <div className="divide-y divide-steel-100 border-t border-steel-100">
                {sale.items.map(it => (
                  <div key={it._id} className="flex flex-wrap items-center justify-between gap-x-2 py-2 text-sm">
                    <div>
                      {it.item_type === 'sheet' ? '📄' : '🔩'} <span className="font-medium">{sizeOf(it)}</span>
                      <span className="text-steel-500"> · {HARDNESS_LABELS[it.hardness] || it.hardness}{it.rust_level && it.rust_level !== 'prime' ? ` · ${RUST_LABELS[it.rust_level]}` : ''}</span>
                    </div>
                    <div className="text-steel-700 flex-shrink-0">{it.pieces ? `${it.pieces} pcs · ` : ''}{displayWeight(it.weight_kg)}</div>
                    {it.strips > 0 && (
                      <div className="basis-full text-xs text-steel-500">
                        ✂️ Cut from a {it.source_width_mm}mm coil{it.strips > 1 ? ` — ${it.strips} strips` : ''}{leftoverText(it) ? ` · leftover ${leftoverText(it)}` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {sale.notes && <div className="text-sm text-steel-500 mt-1">📝 {sale.notes}</div>}
              <div className="flex items-center justify-between mt-2">
                <div className="text-xs text-steel-400">Recorded by {sale.created_by?.username || '—'}</div>
                {!cancelled && (
                  <button onClick={() => { if (window.confirm('Cancel this sale? The weight will be put back into stock.')) cancelMut.mutate(sale._id); }}
                    className="btn-danger btn-xs" disabled={cancelMut.isPending}>Cancel sale</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {formOpen && (
        <NewSaleModal
          customers={customers || []}
          defaultCustomer={filter.customer}
          presetItem={presetItem}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}

function NewSaleModal({ customers, defaultCustomer, presetItem, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ customer: defaultCustomer || '', sale_date: today(), bill_no: '', vehicle_no: '', notes: '' });
  const [lines, setLines] = useState([newLine(presetItem)]);

  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => settingsAPI.get().then(r => r.data) });
  const cutoff = settings?.min_reusable_coil_width_mm ?? 25; // leftover strips narrower than this are scrap

  const { data: stock } = useQuery({ queryKey: ['inventory', 'sale-picker'], queryFn: () => inventoryAPI.getAll().then(r => r.data) });

  // Everything still in stock, keyed "coil:<id>" / "sheet:<id>".
  const items = useMemo(() => {
    const map = new Map();
    for (const c of stock?.coils || []) if (c.remaining_weight_kg > 0) map.set(`coil:${c._id}`, { ...c, kind: 'coil' });
    for (const s of stock?.sheets || []) if (s.remaining_weight_kg > 0) map.set(`sheet:${s._id}`, { ...s, kind: 'sheet' });
    return map;
  }, [stock]);

  const itemOptions = useMemo(() => [...items.entries()].map(([value, it]) => {
    const size = it.kind === 'sheet' ? `${it.length_mm} × ${it.width_mm} × ${it.thickness_mm}mm` : `${it.width_mm}mm × ${it.gauge_mm}mm`;
    const rust = it.rust_level && it.rust_level !== 'prime' ? ` · ${RUST_LABELS[it.rust_level]}` : '';
    return { value, label: `${it.kind === 'sheet' ? '📄' : '🔩'} ${size} · ${HARDNESS_LABELS[it.hardness]}${rust} · ${it.remaining_weight_kg.toFixed(1)} kg left${it.supplier?.name ? ` · ${it.supplier.name}` : ''}` };
  }), [items]);

  const partyOptions = useMemo(() => customers.map(c => ({ value: c._id, label: c.name })), [customers]);

  const updateLine = (key, patch) => setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));
  const pickItem = (key, ref) => updateLine(key, { ref, weight: '', pieces: '' });

  // Slitting a coil: the party gets strips of the cut width and the rest of the coil's width is left over.
  // The leftover runs the same length, so it weighs in proportion to its width (editable: real weights differ).
  const cutOf = line => {
    const it = items.get(line.ref);
    const w = parseFloat(line.weight) || 0;
    if (!it || it.kind !== 'coil' || line.cut === '') return null;
    const cutW = parseFloat(line.cut);
    const strips = parseInt(line.strips || '1', 10);
    if (!(cutW > 0) || cutW >= it.width_mm) return { error: `Cut width must be narrower than the ${it.width_mm}mm coil` };
    if (!(strips >= 1)) return { error: 'Strips must be 1 or more' };
    const usedW = round3(strips * cutW);
    if (usedW > it.width_mm + 0.001) return { error: `${strips} × ${cutW}mm = ${usedW}mm is wider than the ${it.width_mm}mm coil` };
    const leftoverW = round3(Math.max(0, it.width_mm - usedW));
    const autoKg = leftoverW > 0 && w > 0 ? round3(w * leftoverW / usedW) : 0;
    const leftoverKg = leftoverW > 0 ? (line.leftoverKg !== '' ? (parseFloat(line.leftoverKg) || 0) : autoKg) : 0;
    const restockable = leftoverW >= cutoff && leftoverKg > 0;
    return { cutW, strips, usedW, leftoverW, autoKg, leftoverKg, restockable, restock: restockable && line.restock, width: it.width_mm };
  };
  // Everything a line takes out of its coil/sheet: what's sold plus any leftover strip.
  const consumedBy = line => (parseFloat(line.weight) || 0) + (cutOf(line)?.leftoverKg || 0);

  // Weight taken by the other lines from the same item, so the "left" figure is honest.
  const usedElsewhere = (line) => lines.filter(l => l.key !== line.key && l.ref === line.ref).reduce((s, l) => s + consumedBy(l), 0);
  const leftFor = line => { const it = items.get(line.ref); return it ? round3(it.remaining_weight_kg - usedElsewhere(line)) : 0; };

  const setPieces = (line, pieces) => {
    const it = items.get(line.ref);
    const per = it?.weight_per_sheet_kg || (it?.quantity ? it.weight_kg / it.quantity : 0);
    updateLine(line.key, { pieces, ...(per && pieces !== '' ? { weight: String(round3(Number(pieces) * per)) } : {}) });
  };

  const totalKg = round3(lines.reduce((s, l) => s + (parseFloat(l.weight) || 0), 0));

  const saveMut = useMutation({
    mutationFn: salesAPI.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
      toast.success('Sale recorded — stock updated');
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const submit = e => {
    e.preventDefault();
    if (!form.customer) { toast.error('Choose a party'); return; }
    for (const [i, l] of lines.entries()) {
      if (!l.ref) { toast.error(`Item ${i + 1}: choose what is being sold`); return; }
      const w = parseFloat(l.weight);
      if (!(w > 0)) { toast.error(`Item ${i + 1}: enter a weight`); return; }
      const c = cutOf(l);
      if (c?.error) { toast.error(`Item ${i + 1}: ${c.error}`); return; }
      if (consumedBy(l) > leftFor(l) + 0.001) { toast.error(`Item ${i + 1}: only ${leftFor(l).toFixed(2)} kg available${c ? ' (sold + leftover strip)' : ''}`); return; }
    }
    saveMut.mutate({
      ...form,
      items: lines.map(l => {
        const [item_type, item] = l.ref.split(':');
        const c = cutOf(l);
        return {
          item_type, item, weight_kg: parseFloat(l.weight),
          ...(item_type === 'sheet' && l.pieces ? { pieces: Number(l.pieces) } : {}),
          ...(c ? { cut_width_mm: c.cutW, strips: c.strips, restock_leftover: c.restock, ...(l.leftoverKg !== '' ? { leftover_weight_kg: parseFloat(l.leftoverKg) } : {}) } : {}),
        };
      }),
    });
  };

  return (
    <Modal open onClose={onClose} title="New Sale (नई बिक्री)" size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Party <span className="text-red-500">*</span></label>
            <SearchableSelect options={partyOptions} value={form.customer} onChange={v => setForm(f => ({ ...f, customer: v }))} placeholder="Choose party…" />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={form.sale_date} onChange={e => setForm(f => ({ ...f, sale_date: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Bill / Invoice No.</label>
            <input className="input" value={form.bill_no} onChange={e => setForm(f => ({ ...f, bill_no: e.target.value }))} placeholder="optional" />
          </div>
          <div>
            <label className="label">Vehicle No.</label>
            <input className="input" value={form.vehicle_no} onChange={e => setForm(f => ({ ...f, vehicle_no: e.target.value }))} placeholder="optional" />
          </div>
          <div>
            <label className="label">Notes</label>
            <input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="optional" />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items sold (माल)</label>
            <button type="button" onClick={() => setLines(ls => [...ls, newLine()])} className="btn-secondary btn-xs">+ Add Item</button>
          </div>
          {lines.map((l, i) => {
            const it = items.get(l.ref);
            const left = leftFor(l);
            const w = parseFloat(l.weight) || 0;
            const cut = cutOf(l);
            const need = consumedBy(l);
            return (
              <div key={l.key} className="mb-3 p-3 bg-steel-50 rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <label className="text-sm text-steel-600">Item {i + 1} — pick from stock</label>
                    <SearchableSelect options={itemOptions} value={l.ref} onChange={v => pickItem(l.key, v)} placeholder={stock ? 'Choose coil or sheet…' : 'Loading stock…'} />
                  </div>
                  {lines.length > 1 && <button type="button" onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))} className="btn-danger btn-xs mt-6" aria-label={`Remove item ${i + 1}`}>✕</button>}
                </div>
                {it && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
                    {it.kind === 'sheet' && (
                      <div>
                        <label className="text-sm text-steel-600">Pieces (optional)</label>
                        <input type="number" min="0" step="1" className="input" value={l.pieces} onChange={e => setPieces(l, e.target.value)} placeholder="e.g. 3" />
                      </div>
                    )}
                    <div>
                      <label className="text-sm text-steel-600">Weight sold (kg) <span className="text-red-500">*</span></label>
                      <input type="number" min="0" step="0.001" className="input" value={l.weight} onChange={e => updateLine(l.key, { weight: e.target.value })} placeholder="kg" />
                    </div>
                    <div>
                      <button type="button" onClick={() => updateLine(l.key, { weight: String(cut && !cut.error ? round3(left * cut.usedW / cut.width) : left), pieces: '', leftoverKg: '' })} className="btn-secondary btn-xs w-full">Sell all ({left.toFixed(1)} kg)</button>
                    </div>
                    {it.kind === 'coil' && (
                      <>
                        <div>
                          <label className="text-sm text-steel-600">Cut to width (mm) — optional</label>
                          <input type="number" min="0" step="0.1" className="input" value={l.cut} onChange={e => updateLine(l.key, { cut: e.target.value, leftoverKg: '' })} placeholder={`blank = full ${it.width_mm}mm`} />
                        </div>
                        {l.cut !== '' && (
                          <div>
                            <label className="text-sm text-steel-600">Strips of that width</label>
                            <input type="number" min="1" step="1" className="input" value={l.strips} onChange={e => updateLine(l.key, { strips: e.target.value, leftoverKg: '' })} />
                          </div>
                        )}
                      </>
                    )}
                    {cut?.error && <div className="col-span-2 sm:col-span-3 text-sm text-red-600 font-medium">{cut.error}</div>}
                    {cut && !cut.error && (
                      <div className="col-span-2 sm:col-span-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="text-sm font-medium text-amber-900">✂️ Cutting {cut.strips} × {cut.cutW}mm from the {cut.width}mm coil — party gets {cut.cutW}mm</div>
                        {cut.leftoverW > 0 ? (
                          <>
                            <div className="text-sm text-steel-700">Leftover: a <strong>{cut.leftoverW}mm</strong> strip</div>
                            <div className="grid grid-cols-2 gap-2 items-end">
                              <div>
                                <label className="text-sm text-steel-600">Leftover weight (kg)</label>
                                <input type="number" min="0" step="0.001" className="input" value={l.leftoverKg !== '' ? l.leftoverKg : (cut.autoKg || '')} onChange={e => updateLine(l.key, { leftoverKg: e.target.value })} placeholder="auto" />
                              </div>
                              {cut.restockable ? (
                                <label className="flex items-center gap-2 text-sm min-h-11">
                                  <input type="checkbox" className="w-5 h-5" checked={l.restock} onChange={e => updateLine(l.key, { restock: e.target.checked })} />
                                  Add leftover to stock
                                </label>
                              ) : (
                                <div className="text-sm text-amber-800 min-h-11 flex items-center">{cut.leftoverW < cutoff ? `Under ${cutoff}mm — counted as scrap` : 'No weight — nothing to add to stock'}</div>
                              )}
                            </div>
                            <div className="text-xs text-steel-500">Weight is worked out from the width ratio — change it if you weighed the strip.{cut.restockable && !l.restock ? ' Not added to stock: written off.' : ''}</div>
                          </>
                        ) : <div className="text-sm text-steel-700">No leftover — the whole coil width is used.</div>}
                      </div>
                    )}
                    <div className={`col-span-2 sm:col-span-3 text-sm ${need > left + 0.001 ? 'text-red-600 font-medium' : 'text-steel-500'}`}>
                      {need > left + 0.001
                        ? `Only ${left.toFixed(2)} kg available${cut ? ` — this needs ${displayWeight(round3(need))} (sold + leftover)` : ''}`
                        : `${displayWeight(left)} available → ${displayWeight(round3(left - need))} left after this sale`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-right font-semibold">Total: {displayWeight(totalKg)}</div>
          <div className="text-sm text-steel-500">Selling less than what's in stock is fine — the rest stays in stock. A coil can be cut to a narrower width; the leftover strip goes back into stock as its own coil. These sizes are also added to the party's "Sizes Used" list.</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : 'Record Sale'}</button>
        </div>
      </form>
    </Modal>
  );
}
