import { useState } from 'react';
import PageHeader from '../components/PageHeader';
import UnitInput from '../components/UnitInput';
import { displayWeight } from '../utils/units';

// Same formulas the inventory pages use, kept in sync for consistency.
function calcCoilWeight(od, id_, width) {
  if (!od || !id_ || !width) return 0;
  return (Math.PI / 4) * (od ** 2 - id_ ** 2) * width * 0.00786 / 1000;
}
function calcSheetWeight(l, w, t) {
  if (!l || !w || !t) return 0;
  return (l * w * t * 7.86) / 1e6;
}

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

function Result({ label, value, strong }) {
  return (
    <div className="flex justify-between py-1 text-sm">
      <span className="text-steel-500">{label}</span>
      <span className={strong ? 'font-semibold text-steel-900' : 'text-steel-700'}>{value}</span>
    </div>
  );
}

export default function CalculatorPage() {
  const [coil, setCoil] = useState({ od_mm: null, id_mm: null, width_mm: null });
  const [sheet, setSheet] = useState({ length_mm: null, width_mm: null, thickness_mm: null, qty: 1 });
  const [slit, setSlit] = useState({ coil_width_mm: null, cut_width_mm: null, total_weight_kg: '' });

  const coilWt = calcCoilWeight(coil.od_mm, coil.id_mm, coil.width_mm);
  const sheetWt = calcSheetWeight(sheet.length_mm, sheet.width_mm, sheet.thickness_mm);
  const sheetQty = Math.max(1, parseInt(sheet.qty, 10) || 1);

  // Slitting / wastage
  const cw = num(slit.coil_width_mm);
  const cut = num(slit.cut_width_mm);
  const ready = cw > 0 && cut > 0 && cut <= cw;
  const strips = ready ? Math.floor(cw / cut) : 0;
  const usedWidth = strips * cut;
  const leftover = ready ? cw - usedWidth : 0;
  const wastagePct = ready && cw > 0 ? (leftover / cw) * 100 : 0;
  const totalWt = num(slit.total_weight_kg);
  const wastageKg = ready && totalWt > 0 ? (leftover / cw) * totalWt : 0;
  const usefulKg = totalWt > 0 ? totalWt - wastageKg : 0;

  return (
    <div>
      <PageHeader
        title="Calculator (कैलकुलेटर)"
        subtitle="Quick weight & wastage estimates — nothing is saved"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Coil weight */}
        <div className="card">
          <h2 className="font-semibold text-steel-800 mb-3">🔩 Coil Weight (कॉइल वज़न)</h2>
          <div className="grid grid-cols-2 gap-3">
            <UnitInput label="Outer Diameter (OD)" value_mm={coil.od_mm} onChange={v => setCoil(c => ({ ...c, od_mm: v }))} />
            <UnitInput label="Inner Diameter (ID)" value_mm={coil.id_mm} onChange={v => setCoil(c => ({ ...c, id_mm: v }))} />
            <UnitInput label="Width (चौड़ाई)" value_mm={coil.width_mm} onChange={v => setCoil(c => ({ ...c, width_mm: v }))} />
          </div>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Result label="Weight (वज़न)" value={coilWt > 0 ? displayWeight(coilWt) : '—'} strong />
            <div className="text-xs text-blue-500 mt-1">(π/4) × (OD² − ID²) × Width × 0.00786</div>
          </div>
        </div>

        {/* Sheet weight */}
        <div className="card">
          <h2 className="font-semibold text-steel-800 mb-3">📄 Sheet Weight (शीट वज़न)</h2>
          <div className="grid grid-cols-2 gap-3">
            <UnitInput label="Length (लंबाई)" value_mm={sheet.length_mm} onChange={v => setSheet(s => ({ ...s, length_mm: v }))} />
            <UnitInput label="Width (चौड़ाई)" value_mm={sheet.width_mm} onChange={v => setSheet(s => ({ ...s, width_mm: v }))} />
            <UnitInput label="Thickness (मोटाई)" value_mm={sheet.thickness_mm} onChange={v => setSheet(s => ({ ...s, thickness_mm: v }))} />
            <div>
              <label className="label">Quantity (संख्या)</label>
              <input type="number" min="1" className="input" value={sheet.qty} onChange={e => setSheet(s => ({ ...s, qty: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Result label="Per sheet" value={sheetWt > 0 ? displayWeight(sheetWt) : '—'} />
            <Result label={`Total (${sheetQty})`} value={sheetWt > 0 ? displayWeight(sheetWt * sheetQty) : '—'} strong />
          </div>
        </div>

        {/* Slitting / wastage */}
        <div className="card lg:col-span-2">
          <h2 className="font-semibold text-steel-800 mb-3">✂️ Slitting & Wastage (बर्बादी)</h2>
          <div className="grid sm:grid-cols-3 gap-3">
            <UnitInput label="Coil width (कॉइल चौड़ाई)" value_mm={slit.coil_width_mm} onChange={v => setSlit(s => ({ ...s, coil_width_mm: v }))} />
            <UnitInput label="Cut width (कट चौड़ाई)" value_mm={slit.cut_width_mm} onChange={v => setSlit(s => ({ ...s, cut_width_mm: v }))} />
            <div>
              <label className="label">Coil weight (kg, optional)</label>
              <input type="number" min="0" step="any" className="input" value={slit.total_weight_kg} onChange={e => setSlit(s => ({ ...s, total_weight_kg: e.target.value }))} placeholder="for kg breakdown" />
            </div>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-3">
            <div className="bg-steel-50 border border-steel-200 rounded-lg p-3">
              <Result label="Strips across width" value={ready ? `${strips}` : '—'} strong />
              <Result label="Used width" value={ready ? `${usedWidth.toFixed(2)} mm` : '—'} />
              <Result label="Leftover width" value={ready ? `${leftover.toFixed(2)} mm` : '—'} />
              <Result label="Wastage (बर्बादी)" value={ready ? `${wastagePct.toFixed(2)} %` : '—'} strong />
            </div>
            <div className="bg-steel-50 border border-steel-200 rounded-lg p-3">
              <Result label="Useful weight" value={ready && totalWt > 0 ? displayWeight(usefulKg) : '—'} />
              <Result label="Wastage weight" value={ready && totalWt > 0 ? displayWeight(wastageKg) : '—'} strong />
              {cw > 0 && cut > 0 && cut > cw && <div className="text-xs text-red-500 mt-1">Cut width exceeds coil width.</div>}
            </div>
          </div>
          <p className="text-xs text-steel-400 mt-2">Note: estimate ignores blade kerf, matching the optimizer.</p>
        </div>
      </div>
    </div>
  );
}
