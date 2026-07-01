import { useState } from 'react';
import { UNIT_FACTORS, UNIT_LABELS } from '../utils/units';

/**
 * A dimension input that allows unit selection.
 * Always calls onChange with the value in mm.
 */
export default function UnitInput({ value_mm, onChange, placeholder = '0', defaultUnit = 'mm', label, required, disabled }) {
  const [unit, setUnit] = useState(defaultUnit);

  const displayValue = value_mm != null && value_mm !== ''
    ? (value_mm / UNIT_FACTORS[unit]).toFixed(unit === 'mm' ? 2 : 4)
    : '';

  const handleChange = e => {
    const raw = parseFloat(e.target.value);
    if (isNaN(raw)) { onChange(null); return; }
    onChange(parseFloat((raw * UNIT_FACTORS[unit]).toFixed(4)));
  };

  return (
    <div>
      {label && <label className="label">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>}
      <div className="flex gap-1">
        <input
          type="number"
          className="input flex-1"
          placeholder={placeholder}
          value={displayValue}
          onChange={handleChange}
          step="any"
          disabled={disabled}
          required={required}
        />
        <select
          className="select w-20 flex-shrink-0"
          value={unit}
          onChange={e => setUnit(e.target.value)}
          disabled={disabled}
        >
          {Object.entries(UNIT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
