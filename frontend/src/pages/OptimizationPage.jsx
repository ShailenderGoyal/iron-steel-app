import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersAPI, optimizationAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS, RUST_LABELS } from '../utils/units';
import PageHeader from '../components/PageHeader';

export default function OptimizationPage() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedLineItem, setSelectedLineItem] = useState('');
  const [results, setResults] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState('');
  const [leftoverChoice, setLeftoverChoice] = useState('restock');
  const [schedDate, setSchedDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: orders } = useQuery({
    queryKey: ['orders', { status: 'pending' }],
    queryFn: () => ordersAPI.getAll({ status: 'pending' }).then(r => r.data),
  });

  const orderObj = orders?.find(o => o._id === selectedOrder);
  const lineItemObj = orderObj?.line_items?.find(li => li._id === selectedLineItem);

  const runMut = useMutation({
    mutationFn: optimizationAPI.run,
    onSuccess: data => { setResults(data.data); setSelectedOption(null); toast.success(`Found ${data.data.options.length} options`); },
    onError: e => toast.error(e.response?.data?.message || 'Error running optimization'),
  });

  const confirmMut = useMutation({
    mutationFn: optimizationAPI.confirm,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      const rc = res?.data?.restocked_coil;
      toast.success(rc ? `Job created · ${rc.width_mm}mm coil (${Math.round(rc.weight_kg)}kg) restocked` : 'Cutting job created!');
      setResults(null);
      setSelectedOption(null);
      setSelectedOrder('');
    },
    onError: e => toast.error(e.response?.data?.message || 'Error confirming job'),
  });

  const handleRun = () => {
    if (!selectedOrder || !selectedLineItem) { toast.error('Select an order and line item'); return; }
    runMut.mutate({ order_id: selectedOrder, line_item_id: selectedLineItem, top_n: 5 });
  };

  const handleConfirm = () => {
    if (!selectedOption || !selectedMachine) { toast.error('Select an option and machine'); return; }
    const opt = selectedOption;
    const isCoilSrc = !!opt.coil_id;                          // source inventory kind
    const inv_id = isCoilSrc ? opt.coil_id : opt.sheet_id;
    const qty = lineItemObj?.qty_kg || 0;
    const slit = opt.slit_step;
    const reusableKg = opt.reusable_weight_kg || 0;
    const doRestock = reusableKg > 0 && leftoverChoice === 'restock';
    const info = opt.coil_info || {};

    confirmMut.mutate({
      order_id: selectedOrder,
      line_item_id: selectedLineItem,
      machine_id: selectedMachine,
      inventory_id: inv_id,
      inventory_type: isCoilSrc ? 'coil' : 'sheet',
      material_weight_kg: opt.total_consumed_kg || qty,       // whole processed section leaves the source coil
      num_cuts: opt.num_cuts || opt.strips || 2,
      wastage_kg: opt.wastage_kg,
      wastage_pct: opt.wastage_pct,
      scrap_kg: (opt.scrap_kg || 0) + (reusableKg > 0 && leftoverChoice === 'scrap' ? reusableKg : 0),
      restock_leftover: doRestock,
      leftover: doRestock ? { width_mm: opt.reusable_width_mm, gauge_mm: info.gauge_mm, hardness: info.hardness, rust_level: info.rust_level, weight_kg: reusableKg } : null,
      estimated_time_hrs: opt.machines?.find(m => m.machine_id === selectedMachine)?.estimated_time_hrs,
      scheduled_date: schedDate,
      notes: slit ? `Slit to ${slit.to_width_mm}mm on ${slit.machine_name} first, then cut length` : undefined,
      cut_pieces: [{ width_mm: opt.cut_width_mm || lineItemObj?.width_mm, length_mm: opt.cut_length_mm, count: opt.pieces_per_coil_width || opt.strips || opt.pieces_per_sheet || 1 }],
    });
  };

  const wastageColor = pct => pct < 5 ? 'text-green-600' : pct < 15 ? 'text-yellow-600' : 'text-red-600';
  const wastageBar = pct => pct < 5 ? 'bg-green-500' : pct < 15 ? 'bg-yellow-400' : 'bg-red-500';

  return (
    <div>
      <PageHeader
        title="Cutting Optimization (काटा)"
        subtitle="Find the best material and cutting plan to minimize wastage (बर्बादी)"
      />

      {/* Step 1: Select order */}
      <div className="card mb-4">
        <h2 className="font-semibold text-steel-900 mb-4">Step 1: Select Order & Line Item</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="label">Order</label>
            <select className="select" value={selectedOrder} onChange={e => { setSelectedOrder(e.target.value); setSelectedLineItem(''); setResults(null); }}>
              <option value="">— Select Pending Order —</option>
              {orders?.map(o => (
                <option key={o._id} value={o._id}>
                  {o.order_number} — {o.customer?.name} {o.priority === 'high' ? '🔴' : ''}
                </option>
              ))}
            </select>
          </div>

          {orderObj && (
            <div>
              <label className="label">Line Item</label>
              <select className="select" value={selectedLineItem} onChange={e => { setSelectedLineItem(e.target.value); setResults(null); }}>
                <option value="">— Select Item —</option>
                {orderObj.line_items?.map(li => (
                  <option key={li._id} value={li._id}>
                    {li.width_mm}mm × {li.thickness_mm}mm | {HARDNESS_LABELS[li.hardness]} | {li.qty_kg}kg
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="label">Output</label>
            <div className="input bg-steel-50 flex items-center" style={{ minHeight: '42px' }}>
              {lineItemObj
                ? (lineItemObj.length_mm ? '📄 Sheets — has length' : '🔩 Coil — no length')
                : '— select a line item —'}
            </div>
          </div>
        </div>

        {lineItemObj && (
          <div className="mt-4 p-4 bg-steel-50 rounded-lg text-sm grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div><div className="text-steel-400 text-xs">Width</div><div className="font-semibold">{lineItemObj.width_mm} mm</div></div>
            <div><div className="text-steel-400 text-xs">Thickness</div><div className="font-semibold">{lineItemObj.thickness_mm} mm</div></div>
            <div><div className="text-steel-400 text-xs">Hardness</div><div className="font-semibold">{HARDNESS_LABELS[lineItemObj.hardness]}</div></div>
            <div><div className="text-steel-400 text-xs">Quantity</div><div className="font-semibold">{displayWeight(lineItemObj.qty_kg)}</div></div>
            <div><div className="text-steel-400 text-xs">Tolerance ±</div><div className="font-semibold">W:{lineItemObj.width_tolerance_mm}mm G:{lineItemObj.gauge_tolerance_mm}mm</div></div>
          </div>
        )}

        <div className="mt-4">
          <button onClick={handleRun} className="btn-primary" disabled={!selectedOrder || !selectedLineItem || runMut.isPending}>
            {runMut.isPending ? '⏳ Running...' : '⚡ Run Optimization'}
          </button>
        </div>
      </div>

      {/* Step 2: Results */}
      {results && (
        <div className="card mb-4">
          <h2 className="font-semibold text-steel-900 mb-4">
            Step 2: Select Best Option ({results.options.length} options found)
          </h2>

          {results.options.length === 0 ? (
            <div className="text-center py-8 text-steel-400">
              <div className="text-4xl mb-2">🔍</div>
              <div>No matching inventory found. Check stock or tolerance settings.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {results.options.map((opt, i) => {
                const srcInfo = opt.coil_info || opt.sheet_info;
                const isSelected = selectedOption === opt;
                const title = opt.output === 'coil'
                  ? `Slit coil ${srcInfo.width_mm}mm × ${srcInfo.gauge_mm}mm → ${opt.cut_width_mm}mm strips`
                  : opt.source === 'coil'
                    ? `Coil ${srcInfo.width_mm}mm × ${srcInfo.gauge_mm}mm → sheets ${opt.cut_width_mm}×${opt.cut_length_mm}mm`
                    : `Sheet ${srcInfo.width_mm}×${srcInfo.length_mm}mm → cut to ${opt.cut_length_mm}mm`;

                return (
                  <div
                    key={i}
                    onClick={() => { setSelectedOption(opt); setSelectedMachine(opt.machines?.[0]?.machine_id || ''); setLeftoverChoice('restock'); }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-steel-200 hover:border-primary-300'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {i === 0 && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded flex-shrink-0">⭐ BEST</span>}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">
                            {title}
                            {opt.multiple > 1 && <span className="ml-2 text-blue-600 text-xs">({opt.multiple}x)</span>}
                          </div>
                          <div className="text-xs text-steel-500 mt-0.5">
                            {srcInfo.supplier && <span>Supplier: {srcInfo.supplier} | </span>}
                            {srcInfo.rust_level && srcInfo.rust_level !== 'prime' && <span className="text-orange-600">{RUST_LABELS[srcInfo.rust_level]} | </span>}
                            Remaining: {displayWeight(srcInfo.remaining_weight_kg)}
                          </div>
                        </div>
                      </div>

                      {/* Wastage indicator */}
                      <div className="text-right flex-shrink-0">
                        <div className={`text-xl font-bold ${wastageColor(opt.wastage_pct)}`}>{opt.wastage_pct.toFixed(1)}%</div>
                        <div className="text-xs text-steel-400">wastage</div>
                        <div className="w-20 h-2 bg-steel-200 rounded-full mt-1 overflow-hidden">
                          <div className={`h-full rounded-full ${wastageBar(opt.wastage_pct)}`} style={{ width: `${Math.min(opt.wastage_pct, 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                      {opt.output === 'coil' && (
                        <>
                          <div><div className="text-xs text-steel-400">Cut Width</div><div className="font-medium">{opt.cut_width_mm} mm</div></div>
                          <div><div className="text-xs text-steel-400">Pieces/Width</div><div className="font-medium">{opt.pieces_per_coil_width}</div></div>
                        </>
                      )}
                      {opt.output === 'sheet' && opt.source === 'coil' && (
                        <div><div className="text-xs text-steel-400">Strips/Width</div><div className="font-medium">{opt.strips}</div></div>
                      )}
                      {opt.output === 'sheet' && opt.source === 'sheet' && (
                        <div><div className="text-xs text-steel-400">Sheets/pc</div><div className="font-medium">{opt.pieces_per_sheet}</div></div>
                      )}
                      {opt.reusable_width_mm > 0 && (
                        <div><div className="text-xs text-steel-400">Reusable leftover</div><div className="font-medium text-green-600">{opt.reusable_width_mm}mm · {displayWeight(opt.reusable_weight_kg || 0)}</div></div>
                      )}
                      <div>
                        <div className="text-xs text-steel-400">Wastage (बर्बादी)</div>
                        <div className={`font-medium ${wastageColor(opt.wastage_pct)}`}>{displayWeight(opt.wastage_kg)}</div>
                      </div>
                    </div>

                    {/* Slit pre-step (coil → sheet) */}
                    {opt.slit_step && (
                      <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded px-2 py-1 text-amber-800">
                        ✂️ First slit to {opt.slit_step.to_width_mm}mm on <strong>{opt.slit_step.machine_name}</strong> ({opt.slit_step.strips} strips), then cut length:
                      </div>
                    )}

                    {/* Cut machines */}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className="text-xs text-steel-400">{opt.output === 'coil' ? 'Slit on:' : 'Cut length on:'}</span>
                      {opt.machines?.map(m => (
                        <span key={m.machine_id} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-lg">
                          ⚙️ {m.machine_name}{m.machine_type === 'ctl' ? ' · CTL' : m.machine_type === 'shear' ? ' · Shear' : ''}
                          {m.estimated_time_hrs != null && ` (~${m.estimated_time_hrs.toFixed(1)}h)`}
                        </span>
                      ))}
                    </div>

                    {/* Offcut reuse */}
                    {opt.offcut_reuse?.length > 0 && (
                      <div className="mt-2">
                        <div className="text-xs font-medium text-green-700 mb-1">♻️ Offcut can be used for:</div>
                        <div className="flex flex-wrap gap-1">
                          {opt.offcut_reuse.map((r, j) => (
                            <span key={j} className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded border border-green-200">
                              {r.type === 'order' ? `📋 ${r.order_number}` : `👥 ${r.customer_name}`} ({r.width_mm}mm)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Confirm */}
      {selectedOption && (
        <div className="card">
          <h2 className="font-semibold text-steel-900 mb-4">Step 3: Confirm Cutting Job</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Select Machine</label>
              <select className="select" value={selectedMachine} onChange={e => setSelectedMachine(e.target.value)} required>
                <option value="">— Select Machine —</option>
                {selectedOption.machines?.map(m => (
                  <option key={m.machine_id} value={m.machine_id}>
                    {m.machine_name} {m.estimated_time_hrs ? `(~${m.estimated_time_hrs.toFixed(1)}h)` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Scheduled Date</label>
              <input type="date" className="input" value={schedDate} onChange={e => setSchedDate(e.target.value)} />
            </div>
          </div>

          {selectedOption.reusable_weight_kg > 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
              <div className="text-sm font-medium text-green-800 mb-2">
                ♻️ Leftover coil: {selectedOption.reusable_width_mm}mm · {displayWeight(selectedOption.reusable_weight_kg)} — what should happen to it?
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="leftover" checked={leftoverChoice === 'restock'} onChange={() => setLeftoverChoice('restock')} />
                  ↩️ Add back to stock
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="leftover" checked={leftoverChoice === 'scrap'} onChange={() => setLeftoverChoice('scrap')} />
                  🗑️ Convert to scrap
                </label>
              </div>
              {selectedOption.total_consumed_kg && (
                <div className="text-xs text-steel-500 mt-2">
                  This coil will be reduced by {displayWeight(selectedOption.total_consumed_kg)} = order {displayWeight(lineItemObj?.qty_kg)} + leftover {displayWeight(selectedOption.reusable_weight_kg)}.
                </div>
              )}
            </div>
          )}

          {/* Summary */}
          <div className="bg-steel-50 rounded-xl p-4 mb-4 grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-xs text-steel-400">Order</div><div className="font-semibold">{results?.order_number}</div></div>
            <div><div className="text-xs text-steel-400">Wastage %</div><div className={`font-bold text-lg ${wastageColor(selectedOption.wastage_pct)}`}>{selectedOption.wastage_pct.toFixed(1)}%</div></div>
            <div><div className="text-xs text-steel-400">Wastage (बर्बादी)</div><div className={`font-semibold ${wastageColor(selectedOption.wastage_pct)}`}>{displayWeight(selectedOption.wastage_kg)}</div></div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={handleConfirm} className="btn-primary" disabled={!selectedMachine || confirmMut.isPending}>
              {confirmMut.isPending ? '⏳ Creating Job...' : '✅ Confirm & Create Cutting Job'}
            </button>
            <button onClick={() => { setSelectedOption(null); setSelectedMachine(''); }} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
