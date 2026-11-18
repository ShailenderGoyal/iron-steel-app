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
const newLine = (ref = '') => ({
  key: Math.random().toString(36).slice(2), ref, weight: '', weightManual: false, pieces: ref.startsWith('sheet:') ? '1' : '',
  cut: '', strips: '1', leftoverKg: '', restock: true, // coil cut
  cutL: '', cutWd: '', // sheet sold size (blank = the full sheet)
});
const fmtDate = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const sizeOf = it => (it.item_type === 'sheet'
  ? `${it.length_mm} × ${it.width_mm} × ${it.thickness_mm}mm`
  : `${it.width_mm}mm × ${it.thickness_mm}mm`);

// What happened to the strip left over after slitting a coil ('' for an uncut line).
const leftoverText = it => {
  if (!it.strips || !it.leftover_width_mm) return '';
  return it.leftover_coil ? `${it.leftover_width_mm}mm strip (${it.leftover_weight_kg} kg) back in stock` : `${it.leftover_width_mm}mm strip (${it.leftover_weight_kg} kg) scrap`;
};

// What happened to the pieces left after cutting sheets down ('' for an uncut line).
const sheetLeftoverText = it => (it.sheet_leftovers || [])
  .map(l => `${l.length_mm} × ${l.width_mm}mm (${l.weight_kg} kg) ${l.sheet ? 'back in stock' : 'scrap'}`).join(' + ');

const dispatchText = sale => {
  if (sale.status === 'cancelled') return '';
  return sale.dispatch_status === 'dispatched' ? `Dispatched${sale.dispatched_at ? ' ' + fmtDate(sale.dispatched_at) : ''}` : 'Not yet dispatched';
};

const EXPORT_COLUMNS = [
  { label: 'Date', value: r => fmtDate(r.sale.sale_date) },
  { label: 'Bill No', value: r => r.sale.bill_no },
  { label: 'Party', value: r => r.sale.customer?.name },
  { label: 'Vehicle', value: r => r.sale.vehicle_no },
  { label: 'Type', value: r => (r.item.item_type === 'sheet' ? 'Sheet' : 'Coil') },
  { label: 'Size', value: r => sizeOf(r.item) },
  { label: 'Cut from', value: r => (r.item.source_length_mm ? `${r.item.source_length_mm} x ${r.item.source_width_mm}` : r.item.source_width_mm) },
  { label: 'Strips', value: r => r.item.strips },
  { label: 'Leftover', value: r => leftoverText(r.item) || sheetLeftoverText(r.item) },
  { label: 'Hardness', value: r => HARDNESS_LABELS[r.item.hardness] || r.item.hardness },
  { label: 'Pieces', value: r => r.item.pieces },
  { label: 'Weight (kg)', value: r => r.item.weight_kg },
  { label: 'Status', value: r => (r.sale.status === 'cancelled' ? 'Cancelled' : 'Sold') },
  { label: 'Dispatch', value: r => dispatchText(r.sale) },
];

export default function SalesPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState({ customer: params.get('party') || '', from: '', to: '', dispatch: '' });
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

  const dispatchMut = useMutation({
    mutationFn: ({ id, dispatched }) => salesAPI.dispatch(id, { dispatched }),
    onSuccess: (_, { dispatched }) => {
      qc.invalidateQueries({ queryKey: ['sales'] });
      toast.success(dispatched ? 'Marked as dispatched' : 'Marked as not yet dispatched');
    },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const partyOptions = useMemo(() => (customers || []).map(c => ({ value: c._id, label: c.name })), [customers]);

  const active = (sales || []).filter(s => s.status === 'active');
  const totalKg = active.reduce((s, x) => s + x.total_weight_kg, 0);
  const pending = active.filter(s => s.dispatch_status !== 'dispatched').length;
  const exportRows = (sales || []).flatMap(sale => sale.items.map(item => ({ sale, item })));

  const setFilterKey = (k, v) => {
    setFilter(f => ({ ...f, [k]: v }));
    if (k === 'customer') setParams(v ? { party: v } : {}, { replace: true });
  };

  return (
    <div>
      <PageHeader
        title="Sales (बिक्री)"
        subtitle={`${active.length} sale${active.length === 1 ? '' : 's'} · ${displayWeight(totalKg)} sold · ${pending} not yet dispatched`}
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
          <div className="flex-1 min-w-40">
            <label className="label">Dispatch</label>
            <select className="select" value={filter.dispatch} onChange={e => setFilterKey('dispatch', e.target.value)}>
              <option value="">All</option>
              <option value="not_dispatched">Not yet dispatched</option>
              <option value="dispatched">Dispatched</option>
            </select>
          </div>
          <button onClick={() => { setFilter({ customer: '', from: '', to: '', dispatch: '' }); setParams({}, { replace: true }); }} className="btn-secondary self-end">Clear</button>
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
                  {cancelled
                    ? <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Cancelled</span>
                    : sale.dispatch_status === 'dispatched'
                      ? <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">✅ {dispatchText(sale)}</span>
                      : <span className="inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">🕓 Not yet dispatched</span>}
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
                    {it.source_length_mm > 0 && (
                      <div className="basis-full text-xs text-steel-500">
                        ✂️ Cut from {it.source_length_mm} × {it.source_width_mm}mm sheets{it.pieces ? ` (${it.pieces} sheet${it.pieces > 1 ? 's' : ''})` : ''}{sheetLeftoverText(it) ? ` · leftover ${sheetLeftoverText(it)}` : ''}
                      </div>
                    )}
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
                  <div className="flex gap-1.5">
                    {sale.dispatch_status === 'dispatched'
                      ? <button onClick={() => dispatchMut.mutate({ id: sale._id, dispatched: false })} className="btn-secondary btn-xs" disabled={dispatchMut.isPending}>Undo dispatch</button>
                      : <button onClick={() => dispatchMut.mutate({ id: sale._id, dispatched: true })} className="btn-success btn-xs" disabled={dispatchMut.isPending}>🚚 Mark dispatched</button>}
                    <button onClick={() => { if (window.confirm('Cancel this sale? The weight will be put back into stock.')) cancelMut.mutate(sale._id); }}
                      className="btn-danger btn-xs" disabled={cancelMut.isPending}>Cancel sale</button>
                  </div>
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
  const [form, setForm] = useState({ customer: defaultCustomer || '', sale_date: today(), bill_no: '', vehicle_no: '', notes: '', dispatched: false });
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
  const pickItem = (key, ref) => updateLine(key, { ref, weight: '', weightManual: false, pieces: ref.startsWith('sheet:') ? '1' : '', cut: '', strips: '1', leftoverKg: '', cutL: '', cutWd: '' });

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
  // Selling sheets by size: the party buys sheets cut to L' x W' (blank = the full sheet). Each sheet in the stock
  // record weighs the same, so the sold weight is a plain area ratio (roughly right; editable), and what is left
  // of each sheet is up to two pieces — cut the length first: a full-width piece, then a side strip off the cut length.
  const sheetOf = line => {
    const it = items.get(line.ref);
    if (!it || it.kind !== 'sheet') return null;
    const per = it.weight_per_sheet_kg || (it.quantity ? it.weight_kg / it.quantity : 0);
    const L2 = line.cutL === '' ? it.length_mm : parseFloat(line.cutL);
    const W2 = line.cutWd === '' ? it.width_mm : parseFloat(line.cutWd);
    const p = parseInt(line.pieces || '0', 10) || 0;
    if (!(L2 > 0) || L2 > it.length_mm + 0.001) return { error: `Length must be between 0 and ${it.length_mm}mm`, per, p };
    if (!(W2 > 0) || W2 > it.width_mm + 0.001) return { error: `Width must be between 0 and ${it.width_mm}mm`, per, p };
    const cutting = L2 < it.length_mm - 0.001 || W2 < it.width_mm - 0.001;
    if (!cutting) return { cutting: false, per, p, L2, W2, autoKg: p > 0 ? round3(p * per) : 0 };
    if (p < 1) return { error: 'Enter how many sheets are being cut', cutting, per, p, L2, W2, autoKg: 0 };
    const consumed = round3(p * per);
    const autoKg = round3(consumed * (L2 * W2) / (it.length_mm * it.width_mm));
    return { cutting, per, p, L2, W2, consumed, autoKg };
  };
  // The weight a line sells: typed in, or (for sheets) worked out from the size and number of sheets.
  const weightOf = line => {
    const sh = sheetOf(line);
    if (sh && !sh.error && !line.weightManual) return sh.autoKg;
    return parseFloat(line.weight) || 0;
  };
  const sheetLeftovers = (line, sh) => {
    const it = items.get(line.ref);
    const sold = weightOf(line);
    const total = round3(Math.max(0, sh.consumed - sold));
    const specs = [];
    if (sh.L2 < it.length_mm - 0.001) specs.push({ length: round3(it.length_mm - sh.L2), width: it.width_mm });
    if (sh.W2 < it.width_mm - 0.001) specs.push({ length: sh.L2, width: round3(it.width_mm - sh.W2) });
    const areas = specs.reduce((a, x) => a + x.length * x.width, 0);
    return specs.map(x => {
      const kg = total > 0 ? round3(total * (x.length * x.width) / areas) : 0;
      const reusable = Math.min(x.length, x.width) >= cutoff && kg > 0;
      return { ...x, kg, reusable, restock: reusable && line.restock };
    });
  };

  // Everything a line takes out of its coil/sheet: what's sold plus any leftover strip / pieces.
  const consumedBy = line => {
    const sh = sheetOf(line);
    if (sh && !sh.error && sh.cutting) return sh.consumed;
    return weightOf(line) + (cutOf(line)?.leftoverKg || 0);
  };

  // Weight taken by the other lines from the same item, so the "left" figure is honest.
  const usedElsewhere = (line) => lines.filter(l => l.key !== line.key && l.ref === line.ref).reduce((s, l) => s + consumedBy(l), 0);
  const leftFor = line => { const it = items.get(line.ref); return it ? round3(it.remaining_weight_kg - usedElsewhere(line)) : 0; };

  const totalKg = round3(lines.reduce((s, l) => s + weightOf(l), 0));

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
      const c = cutOf(l);
      const sh = sheetOf(l);
      if (c?.error || sh?.error) { toast.error(`Item ${i + 1}: ${c?.error || sh.error}`); return; }
      const w = weightOf(l);
      if (!(w > 0)) { toast.error(`Item ${i + 1}: enter a weight${sh ? ' or the number of sheets' : ''}`); return; }
      if (sh?.cutting && w > sh.consumed + 0.001) { toast.error(`Item ${i + 1}: ${sh.p} sheet${sh.p > 1 ? 's' : ''} weigh only about ${sh.consumed} kg`); return; }
      if (consumedBy(l) > leftFor(l) + 0.001) { toast.error(`Item ${i + 1}: only ${leftFor(l).toFixed(2)} kg available${c || sh?.cutting ? ' (sold + leftover)' : ''}`); return; }
    }
    const { dispatched, ...saleFields } = form;
    saveMut.mutate({
      ...saleFields,
      items: lines.map(l => {
        const [item_type, item] = l.ref.split(':');
        const c = cutOf(l);
        const sh = sheetOf(l);
        return {
          item_type, item, weight_kg: weightOf(l),
          ...(item_type === 'sheet' && l.pieces ? { pieces: Number(l.pieces) } : {}),
          ...(c ? { cut_width_mm: c.cutW, strips: c.strips, restock_leftover: c.restock, ...(l.leftoverKg !== '' ? { leftover_weight_kg: parseFloat(l.leftoverKg) } : {}) } : {}),
          ...(sh?.cutting ? { cut_length_mm: sh.L2, cut_width_mm: sh.W2, restock_leftover: l.restock } : {}),
        };
      }),
      dispatch_status: form.dispatched ? 'dispatched' : 'not_dispatched',
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
          <label className="flex items-center gap-2 text-base min-h-11 sm:col-span-2">
            <input type="checkbox" className="w-5 h-5" checked={form.dispatched} onChange={e => setForm(f => ({ ...f, dispatched: e.target.checked }))} />
            Already dispatched (goods have gone out)
          </label>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Items sold (माल)</label>
            <button type="button" onClick={() => setLines(ls => [...ls, newLine()])} className="btn-secondary btn-xs">+ Add Item</button>
          </div>
          {lines.map((l, i) => {
            const it = items.get(l.ref);
            const left = leftFor(l);
            const cut = cutOf(l);
            const sh = sheetOf(l);
            const lo = sh && !sh.error && sh.cutting ? sheetLeftovers(l, sh) : [];
            const need = consumedBy(l);
            const w = weightOf(l);
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
                      <>
                        <div>
                          <label className="text-sm text-steel-600">Sold length (mm)</label>
                          <input type="number" min="0" step="0.1" className="input" value={l.cutL} onChange={e => updateLine(l.key, { cutL: e.target.value })} placeholder={`full ${it.length_mm}`} />
                        </div>
                        <div>
                          <label className="text-sm text-steel-600">Sold width (mm)</label>
                          <input type="number" min="0" step="0.1" className="input" value={l.cutWd} onChange={e => updateLine(l.key, { cutWd: e.target.value })} placeholder={`full ${it.width_mm}`} />
                        </div>
                        <div>
                          <label className="text-sm text-steel-600">{sh?.cutting ? 'Sheets cut (pcs)' : 'Number of sheets'}</label>
                          <input type="number" min="0" step="1" className="input" value={l.pieces} onChange={e => updateLine(l.key, { pieces: e.target.value, ...(sh?.cutting ? {} : { weightManual: false }) })} placeholder="e.g. 3" />
                        </div>
                      </>
                    )}
                    <div>
                      <label className="text-sm text-steel-600">Weight sold (kg) <span className="text-red-500">*</span>{it.kind === 'sheet' && !l.weightManual && w > 0 ? ' — auto' : ''}</label>
                      <input type="number" min="0" step="0.001" className="input"
                        value={it.kind === 'sheet' && !l.weightManual ? (w > 0 ? w : '') : l.weight}
                        onChange={e => updateLine(l.key, { weight: e.target.value, weightManual: true, ...(it.kind === 'sheet' && !sh?.cutting ? { pieces: '' } : {}) })} placeholder="kg" />
                    </div>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => updateLine(l.key, it.kind === 'sheet'
                        ? { cutL: '', cutWd: '', weight: String(left), weightManual: true, pieces: sh?.per ? String(Math.round(left / sh.per)) : '' }
                        : { weight: String(cut && !cut.error ? round3(left * cut.usedW / cut.width) : left), weightManual: true, leftoverKg: '' })} className="btn-secondary btn-xs flex-1">Sell all ({left.toFixed(1)} kg)</button>
                      {it.kind === 'sheet' && l.weightManual && <button type="button" onClick={() => updateLine(l.key, { weight: '', weightManual: false })} className="btn-secondary btn-xs" title="Work the weight out from the size again">↺ Auto</button>}
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
                    {sh && !sh.error && sh.per > 0 && <div className="col-span-2 sm:col-span-3 text-xs text-steel-500">Each sheet in this stock weighs about {sh.per.toFixed(2)} kg ({it.length_mm} × {it.width_mm}mm). Weight sold is worked out from the size — change it if you weighed it.</div>}
                    {sh?.error && <div className="col-span-2 sm:col-span-3 text-sm text-red-600 font-medium">{sh.error}</div>}
                    {lo.length > 0 && (
                      <div className="col-span-2 sm:col-span-3 rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                        <div className="text-sm font-medium text-amber-900">✂️ Cutting {sh.p} sheet{sh.p > 1 ? 's' : ''} to {sh.L2} × {sh.W2}mm — party gets {sh.L2} × {sh.W2}mm</div>
                        <div className="text-sm text-steel-700">Left behind (from {sh.p} sheet{sh.p > 1 ? 's' : ''}):</div>
                        <ul className="text-sm space-y-1">
                          {lo.map((x, k) => (
                            <li key={k} className="flex flex-wrap justify-between gap-x-2">
                              <span><strong>{x.length} × {x.width}mm</strong> ({x.kg} kg)</span>
                              <span className={x.restock ? 'text-green-700' : 'text-amber-800'}>{x.restock ? 'added to stock' : x.reusable ? 'written off' : `under ${cutoff}mm — scrap`}</span>
                            </li>
                          ))}
                        </ul>
                        {lo.some(x => x.reusable) && (
                          <label className="flex items-center gap-2 text-sm min-h-11">
                            <input type="checkbox" className="w-5 h-5" checked={l.restock} onChange={e => updateLine(l.key, { restock: e.target.checked })} />
                            Add leftover pieces to stock
                          </label>
                        )}
                      </div>
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
                        ? `Only ${left.toFixed(2)} kg available${cut || sh?.cutting ? ` — this needs ${displayWeight(round3(need))} (sold + leftover)` : ''}`
                        : `${displayWeight(left)} available → ${displayWeight(round3(left - need))} left after this sale`}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <div className="text-right font-semibold">Total: {displayWeight(totalKg)}</div>
          <div className="text-sm text-steel-500">Selling less than what's in stock is fine — the rest stays in stock. A coil can be cut to a narrower width and a sheet to a smaller size; what is left goes back into stock as its own coil or sheet. These sizes are also added to the party's "Sizes Used" list.</div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={saveMut.isPending}>{saveMut.isPending ? 'Saving...' : 'Record Sale'}</button>
        </div>
      </form>
    </Modal>
  );
}
