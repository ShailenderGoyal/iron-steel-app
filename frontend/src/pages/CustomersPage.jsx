import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersAPI } from '../services/api';
import { exportPdf } from '../utils/exportPdf';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const emptyForm = { name: '', contact: '', phone: '', address: '', preferred_sizes: [], notes: '' };
const emptySize = { item_type: 'coil', width_mm: '', thickness_mm: '', length_mm: '', notes: '' };

// Checks one dimension of a party's saved size against a search value.
// A blank value on the party's side means "accepts any" — always matches, but is
// flagged as a wildcard so the UI can show it's not an exact match.
function checkDim(partyVal, searchVal, tol, dimName, wildcards) {
  if (searchVal == null) return true; // this dimension wasn't searched — irrelevant
  if (partyVal == null || partyVal === '') { wildcards.push(dimName); return true; }
  return Math.abs(Number(partyVal) - searchVal) <= tol;
}

// Returns { size, wildcards } if `s` matches the filter, else null.
function matchSize(s, filter) {
  if ((s.item_type || 'coil') !== filter.item_type) return null;
  const wildcards = [];
  if (!checkDim(s.width_mm, filter.width_mm, filter.width_tol, 'width', wildcards)) return null;
  if (!checkDim(s.thickness_mm, filter.gauge_mm, filter.gauge_tol, 'gauge', wildcards)) return null;
  if (filter.item_type === 'sheet' && !checkDim(s.length_mm, filter.length_mm, filter.length_tol, 'length', wildcards)) return null;
  return { size: s, wildcards };
}

export default function CustomersPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showSearch, setShowSearch] = useState(!!(params.get('width') || params.get('gauge') || params.get('length')));

  const [search, setSearch] = useState({
    item_type: params.get('type') || 'coil',
    width_mm: params.get('width') || '',
    gauge_mm: params.get('gauge') || '',
    length_mm: params.get('length') || '',
    width_tol: 2,
    gauge_tol: 0.05,
    length_tol: 2,
  });

  const { data: customers, isLoading } = useQuery({
    queryKey: ['customers'],
    queryFn: () => customersAPI.getAll().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: customersAPI.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Party added'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => customersAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Updated'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: customersAPI.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers'] }); toast.success('Removed'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const openAdd = () => { setEditing(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c) => { setEditing(c._id); setForm({ ...c, preferred_sizes: c.preferred_sizes || [] }); setShowModal(true); };

  const addSize = () => setForm(f => ({ ...f, preferred_sizes: [...f.preferred_sizes, { ...emptySize }] }));
  const removeSize = (i) => setForm(f => ({ ...f, preferred_sizes: f.preferred_sizes.filter((_, idx) => idx !== i) }));
  const updateSize = (i, key, val) => setForm(f => {
    const ps = [...f.preferred_sizes];
    ps[i] = { ...ps[i], [key]: val };
    if (key === 'item_type' && val === 'coil') ps[i].length_mm = ''; // length isn't applicable to coils
    return { ...f, preferred_sizes: ps };
  });

  const handleSubmit = e => {
    e.preventDefault();
    const data = {
      ...form,
      preferred_sizes: form.preferred_sizes.filter(s => s.width_mm || s.thickness_mm || s.length_mm),
    };
    if (editing) updateMut.mutate({ id: editing, data });
    else createMut.mutate(data);
  };

  // --- Search by size: which parties buy a given width+gauge(+length for sheets)? ---
  // A blank field on a party's saved size means "accepts any" for that dimension —
  // still a match, but flagged (not exact) so the results clearly show it.
  const searchActive = search.width_mm !== '' || search.gauge_mm !== '' || search.length_mm !== '';
  const results = useMemo(() => {
    if (!searchActive || !customers) return [];
    const filter = {
      item_type: search.item_type,
      width_mm: search.width_mm !== '' ? parseFloat(search.width_mm) : null,
      gauge_mm: search.gauge_mm !== '' ? parseFloat(search.gauge_mm) : null,
      length_mm: search.length_mm !== '' ? parseFloat(search.length_mm) : null,
      width_tol: Number(search.width_tol || 0),
      gauge_tol: Number(search.gauge_tol || 0),
      length_tol: Number(search.length_tol || 0),
    };
    const out = [];
    for (const c of customers) {
      const matched = (c.preferred_sizes || []).map(s => matchSize(s, filter)).filter(Boolean);
      if (matched.length) out.push({ customer: c, matched });
    }
    return out;
  }, [customers, search, searchActive]);

  const updateSearch = (key, val) => {
    setSearch(s => ({ ...s, [key]: val }));
    const next = { ...search, [key]: val };
    setParams({ type: next.item_type, width: next.width_mm, gauge: next.gauge_mm, length: next.length_mm }, { replace: true });
  };

  const sizeLabel = ({ width_mm, thickness_mm, length_mm }) =>
    `${width_mm ? `${width_mm}mm` : 'any width'} × ${thickness_mm ? `${thickness_mm}mm` : 'any gauge'}`
    + (search.item_type === 'sheet' ? ` × ${length_mm ? `${length_mm}mm` : 'any length'}` : '');

  const printResults = () => {
    const rows = results.flatMap(({ customer: c, matched }) => matched.map(({ size: s, wildcards }) => ({
      party: c.name,
      phone: c.phone || '—',
      size: sizeLabel(s),
      match: wildcards.length === 0 ? 'Exact' : `Not exact — any ${wildcards.join('/')}`,
      notes: s.notes || '—',
    })));
    exportPdf({
      title: `${search.item_type === 'coil' ? 'Coil' : 'Sheet'} — ${sizeLabel({ width_mm: search.width_mm, thickness_mm: search.gauge_mm, length_mm: search.length_mm })}`,
      subtitle: `Parties buying this size — ${results.length} found`,
      columns: [
        { label: 'Party', value: r => r.party },
        { label: 'Phone', value: r => r.phone },
        { label: 'Matched Size', value: r => r.size },
        { label: 'Match', value: r => r.match },
        { label: 'Notes', value: r => r.notes },
      ],
      rows,
    });
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Parties / Customers (पार्टी)"
          subtitle={`${customers?.length || 0} parties`}
          actions={
            <div className="flex gap-2">
              <button onClick={() => setShowSearch(s => !s)} className="btn-secondary">🔎 Search by Size</button>
              <button onClick={openAdd} className="btn-primary">+ Add Party</button>
            </div>
          }
        />
      </div>

      {/* Search by size — the results table below is the only thing that prints */}
      {showSearch && (
        <div className="card mb-4 no-print">
          <h2 className="font-semibold mb-3">🔎 Search Parties by Size</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
            <div>
              <label className="label">Type</label>
              <select className="select" value={search.item_type} onChange={e => updateSearch('item_type', e.target.value)}>
                <option value="coil">🔩 Coil</option>
                <option value="sheet">📄 Sheet</option>
              </select>
            </div>
            <div>
              <label className="label">Width (mm)</label>
              <input type="number" step="0.1" className="input" value={search.width_mm} onChange={e => updateSearch('width_mm', e.target.value)} placeholder="e.g. 500" />
            </div>
            <div>
              <label className="label">± Tolerance</label>
              <input type="number" step="0.1" className="input" value={search.width_tol} onChange={e => updateSearch('width_tol', e.target.value)} />
            </div>
            <div>
              <label className="label">Gauge/Thickness (mm)</label>
              <input type="number" step="0.01" className="input" value={search.gauge_mm} onChange={e => updateSearch('gauge_mm', e.target.value)} placeholder="e.g. 2" />
            </div>
            <div>
              <label className="label">± Tolerance</label>
              <input type="number" step="0.01" className="input" value={search.gauge_tol} onChange={e => updateSearch('gauge_tol', e.target.value)} />
            </div>
            {search.item_type === 'sheet' && (
              <>
                <div>
                  <label className="label">Length (mm)</label>
                  <input type="number" step="0.1" className="input" value={search.length_mm} onChange={e => updateSearch('length_mm', e.target.value)} placeholder="e.g. 2500" />
                </div>
                <div>
                  <label className="label">± Tolerance</label>
                  <input type="number" step="0.1" className="input" value={search.length_tol} onChange={e => updateSearch('length_tol', e.target.value)} />
                </div>
              </>
            )}
          </div>
          <div className="text-sm text-steel-500 mt-2">Parties with a blank width/gauge/length accept any value for that dimension — they'll still show up as a match, marked "any".</div>
        </div>
      )}

      {searchActive && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              {search.item_type === 'coil' ? '🔩' : '📄'} {search.width_mm || '—'}mm × {search.gauge_mm || '—'}mm{search.item_type === 'sheet' ? ` × ${search.length_mm || '—'}mm` : ''} — {search.item_type === 'coil' ? 'Coil' : 'Sheet'}
              <span className="text-steel-500 font-normal text-sm ml-2">({results.length} part{results.length === 1 ? 'y' : 'ies'})</span>
            </h2>
            {results.length > 0 && <button onClick={printResults} className="btn-primary no-print">📄 PDF / Print</button>}
          </div>
          {results.length === 0 ? (
            <div className="text-center text-steel-400 py-6 no-print">No parties found for this size yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-steel-50 border-b border-steel-200">
                  <tr>
                    {['Party', 'Phone', 'Matched Size', 'Match', 'Notes'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {results.map(({ customer: c, matched }) => (
                    <tr key={c._id}>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">{c.phone || '—'}</td>
                      <td className="px-3 py-2">
                        {matched.map(({ size: s }, i) => (
                          <div key={i}>
                            {s.width_mm ? `${s.width_mm}mm` : 'any width'} × {s.thickness_mm ? `${s.thickness_mm}mm` : 'any gauge'}
                            {search.item_type === 'sheet' && <> × {s.length_mm ? `${s.length_mm}mm` : 'any length'}</>}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2">
                        {matched.map(({ wildcards }, i) => (
                          <div key={i}>
                            {wildcards.length === 0
                              ? <span className="text-green-700 text-sm font-medium">✓ Exact</span>
                              : <span className="text-amber-700 text-sm font-medium">⚠ Not exact — any {wildcards.join('/')}</span>}
                          </div>
                        ))}
                      </td>
                      <td className="px-3 py-2 text-steel-500">{matched.map(({ size: s }) => s.notes).filter(Boolean).join('; ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="no-print grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && <div className="card col-span-3 text-center text-steel-400">Loading...</div>}
        {customers?.length === 0 && <div className="card col-span-3 text-center text-steel-400 py-12">No parties yet</div>}
        {customers?.map(c => (
          <div key={c._id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <h3 className="font-semibold text-lg">{c.name}</h3>
                {c.phone && <div className="text-sm text-steel-500">📞 {c.phone}</div>}
                {c.contact && <div className="text-sm text-steel-500">👤 {c.contact}</div>}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(c)} className="btn-secondary btn-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Remove party?')) deleteMut.mutate(c._id); }} className="btn-danger btn-xs">Del</button>
              </div>
            </div>

            {c.preferred_sizes?.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-steel-500 mb-1 uppercase tracking-wide">Sizes Used</div>
                <div className="flex flex-wrap gap-1.5">
                  {c.preferred_sizes.map((s, i) => (
                    <span key={i} className="bg-steel-100 text-steel-700 text-sm px-2 py-1 rounded-md">
                      {s.item_type === 'sheet' ? '📄' : '🔩'} {s.width_mm ? `${s.width_mm}mm` : 'any width'} × {s.thickness_mm ? `${s.thickness_mm}mm` : 'any gauge'}
                      {s.item_type === 'sheet' && <> × {s.length_mm ? `${s.length_mm}mm` : 'any length'}</>}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Party' : 'Add Party (पार्टी जोड़ें)'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Party Name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="Customer / Party name" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Person</label>
              <input className="input" value={form.contact || ''} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} />
            </div>
            <div>
              <label className="label">Phone</label>
              <input className="input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">Address</label>
            <textarea className="input" rows={2} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Sizes Used (साइज़)</label>
              <button type="button" onClick={addSize} className="btn-secondary btn-xs">+ Add Size</button>
            </div>
            {form.preferred_sizes.map((s, i) => {
              const isCoil = (s.item_type || 'coil') === 'coil';
              return (
                <div key={i} className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-2 p-2 bg-steel-50 rounded-lg">
                  <div>
                    <label className="text-sm text-steel-600">Type</label>
                    <select className="select" value={s.item_type || 'coil'} onChange={e => updateSize(i, 'item_type', e.target.value)}>
                      <option value="coil">🔩 Coil</option>
                      <option value="sheet">📄 Sheet</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-steel-600">Width (mm)</label>
                    <input type="number" className="input" step="0.1" value={s.width_mm} onChange={e => updateSize(i, 'width_mm', e.target.value)} placeholder="blank = any" />
                  </div>
                  <div>
                    <label className="text-sm text-steel-600">Gauge/Thickness (mm)</label>
                    <input type="number" className="input" step="0.01" value={s.thickness_mm} onChange={e => updateSize(i, 'thickness_mm', e.target.value)} placeholder="blank = any" />
                  </div>
                  <div>
                    <label className="text-sm text-steel-600">Length (mm){isCoil ? ' — n/a' : ''}</label>
                    <input type="number" className="input" step="0.1" value={s.length_mm} disabled={isCoil}
                      onChange={e => updateSize(i, 'length_mm', e.target.value)} placeholder={isCoil ? 'n/a for coils' : 'blank = any'} />
                  </div>
                  <div>
                    <label className="text-sm text-steel-600">Notes</label>
                    <input className="input" value={s.notes || ''} onChange={e => updateSize(i, 'notes', e.target.value)} placeholder="optional" />
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => removeSize(i)} className="btn-danger btn-xs w-full">Remove</button>
                  </div>
                </div>
              );
            })}
            <div className="text-sm text-steel-500">Leave width/gauge/length blank if this party accepts any value for that dimension.</div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary" disabled={createMut.isPending || updateMut.isPending}>
              {editing ? 'Update' : 'Add Party'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
