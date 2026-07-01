import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersAPI, optimizationAPI } from '../services/api';
import { displayWeight, HARDNESS_LABELS } from '../utils/units';
import PageHeader from '../components/PageHeader';

export default function OptimizationPage() {
  const qc = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState('');
  const [selectedLineItem, setSelectedLineItem] = useState('');
  const [materialType, setMaterialType] = useState('coil');
  const [results, setResults] = useState(null);
  const [selectedOption, setSelectedOption] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState('');
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success('Cutting job created!');
      setResults(null);
      setSelectedOption(null);
      setSelectedOrder('');
    },
    onError: e => toast.error(e.response?.data?.message || 'Error confirming job'),
  });

  const handleRun = () => {
    if (!selectedOrder || !selectedLineItem) { toast.error('Select an order and line item'); return; }
    runMut.mutate({ order_id: selectedOrder, line_item_id: selectedLineItem, material_type: materialType, top_n: 5 });
  };

  const handleConfirm = () => {
    if (!selectedOption || !selectedMachine) { toast.error('Select an option and machine'); return; }
    const inv_id = materialType === 'coil' ? selectedOption.coil_id : selectedOption.sheet_id;
    const qty = lineItemObj?.qty_kg || 0;

    confirmMut.mutate({
      order_id: selectedOrder,
      line_item_id: selectedLineItem,
      machine_id: selectedMachine,
      inventory_id: inv_id,
      inventory_type: materialType,
      material_weight_kg: qty,
      num_cuts: selectedOption.num_cuts || 2,
      wastage_kg: selectedOption.wastage_kg,
      wastage_pct: selectedOption.wastage_pct,
      scrap_kg: selectedOption.scrap_kg,
      estimated_time_hrs: selectedOption.machines?.find(m => m.machine_id === selectedMachine)?.estimated_time_hrs,
      scheduled_date: schedDate,
      cut_pieces: [{ width_mm: selectedOption.cut_width_mm || lineItemObj?.width_mm, count: selectedOption.pieces_per_coil_width || 1 }],
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
            <label className="label">Material Type</label>
            <div className="flex gap-2">
              {['coil', 'sheet'].map(t => (
                <button key={t} type="button"
                  onClick={() => setMaterialType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${materialType === t ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-steel-700 border-steel-300 hover:border-primary-400'}`}>
                  {t === 'coil' ? '🔩 Coil' : '📄 Sheet'}
                </button>
              ))}
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
                const isCoil = !!opt.coil_info;
                const info = isCoil ? opt.coil_info : opt.sheet_info;
                const isSelected = selectedOption === opt;

                return (
                  <div
                    key={i}
                    onClick={() => { setSelectedOption(opt); setSelectedMachine(opt.machines?.[0]?.machine_id || ''); }}
                    className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${isSelected ? 'border-primary-500 bg-primary-50' : 'border-steel-200 hover:border-primary-300'}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        {i === 0 && <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded flex-shrink-0">⭐ BEST</span>}
                        <div className="min-w-0">
                          <div className="font-semibold text-sm">
                            {isCoil
                              ? `Coil: ${info.width_mm}mm × ${info.gauge_mm}mm — ${HARDNESS_LABELS[info.hardness]}`
                              : `Sheet: ${info.width_mm}×${info.length_mm}mm × ${info.thickness_mm}mm`
                            }
                            {opt.multiple > 1 && <span className="ml-2 text-blue-600 text-xs">({opt.multiple}x)</span>}
                          </div>
                          <div className="text-xs text-steel-500 mt-0.5">
                            {info.supplier && <span>Supplier: {info.supplier} | </span>}
                            Remaining: {displayWeight(info.remaining_weight_kg)}
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
                      {isCoil && (
                        <>
                          <div><div className="text-xs text-steel-400">Cut Width</div><div className="font-medium">{opt.cut_width_mm} mm</div></div>
                          <div><div className="text-xs text-steel-400">Pieces/Width</div><div className="font-medium">{opt.pieces_per_coil_width}</div></div>
                          <div><div className="text-xs text-steel-400">Leftover</div><div className="font-medium">{opt.leftover_width_mm} mm</div></div>
                        </>
                      )}
                      {!isCoil && (
                        <div><div className="text-xs text-steel-400">Pieces/Sheet</div><div className="font-medium">{opt.pieces_per_sheet}</div></div>
                      )}
                      <div>
                        <div className="text-xs text-steel-400">Wastage (बर्बादी)</div>
                        <div className={`font-medium ${wastageColor(opt.wastage_pct)}`}>{displayWeight(opt.wastage_kg)}</div>
                      </div>
                    </div>

                    {/* Machines */}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {opt.machines?.map(m => (
                        <span key={m.machine_id} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-lg">
                          ⚙️ {m.machine_name}
                          {m.estimated_time_hrs && ` (~${m.estimated_time_hrs.toFixed(1)}h)`}
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
