import { useState, useRef, useEffect } from 'react';

/**
 * A type-to-search dropdown. options: [{ value, label }].
 * Calls onChange(value) when an option is picked.
 */
export default function SearchableSelect({ options = [], value, onChange, placeholder = 'Search…' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (q ? options.filter(o => o.label.toLowerCase().includes(q)) : options).slice(0, 50);

  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between w-full text-left" onClick={() => setOpen(o => !o)}>
        <span className={selected ? 'truncate' : 'text-steel-400'}>{selected ? selected.label : placeholder}</span>
        <span className="text-steel-400 flex-shrink-0 ml-2">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-steel-300 rounded-lg shadow-lg max-h-64 overflow-auto">
          <div className="p-2 sticky top-0 bg-white border-b border-steel-100">
            <input autoFocus className="input w-full" placeholder="Type to search…" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          {filtered.length === 0 && <div className="px-3 py-3 text-sm text-steel-400">No match</div>}
          {filtered.map(o => (
            <div key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); setQuery(''); }}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-primary-50 ${o.value === value ? 'bg-primary-100 font-medium' : ''}`}>
              {o.label}
            </div>
          ))}
          {!q && options.length > 50 && (
            <div className="px-3 py-1.5 text-xs text-steel-400 border-t border-steel-100">Showing 50 of {options.length} — type to narrow</div>
          )}
        </div>
      )}
    </div>
  );
}
