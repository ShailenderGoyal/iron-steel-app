import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersAPI } from '../services/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const emptyForm = { name: '', contact: '', phone: '', address: '', preferred_sizes: [], notes: '' };
const emptySize = { item_type: 'coil', width_mm: '', thickness_mm: '', notes: '' };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showSearch, setShowSearch] = useState(!!(params.get('width') || params.get('gauge')));

  const [search, setSearch] = useState({
    item_type: params.get('type') || 'coil',
    width_mm: params.get('width') || '',
    gauge_mm: params.get('gauge') || '',
    width_tol: 2,
    gauge_tol: 0.05,
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
    return { ...f, preferred_sizes: ps };
  });

  const handleSubmit = e => {
    e.preventDefault();
    const data = {
      ...form,
      preferred_sizes: form.preferred_sizes.filter(s => s.width_mm || s.thickness_mm),
    };
    if (editing) updateMut.mutate({ id: editing, data });
    else createMut.mutate(data);
  };

  // --- Search by size: which parties buy a given width+gauge (coil or sheet)? ---
  const searchActive = search.width_mm !== '' || search.gauge_mm !== '';
  const results = useMemo(() => {
    if (!searchActive || !customers) return [];
    const w = search.width_mm !== '' ? parseFloat(search.width_mm) : null;
    const g = search.gauge_mm !== '' ? parseFloat(search.gauge_mm) : null;
    const out = [];
    for (const c of customers) {
      const matched = (c.preferred_sizes || []).filter(s => {
        if ((s.item_type || 'coil') !== search.item_type) return false;
        if (w != null && Math.abs((s.width_mm ?? -Infinity) - w) > Number(search.width_tol || 0)) return false;
        if (g != null && Math.abs((s.thickness_mm ?? -Infinity) - g) > Number(search.gauge_tol || 0)) return false;
        return true;
      });
      if (matched.length) out.push({ customer: c, matched });
    }
    return out;
  }, [customers, search, searchActive]);

  const updateSearch = (key, val) => {
    setSearch(s => ({ ...s, [key]: val }));
    const next = { ...search, [key]: val };
    setParams({ type: next.item_type, width: next.width_mm, gauge: next.gauge_mm }, { replace: true });
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
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
          </div>
        </div>
      )}

      {searchActive && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">
              {search.item_type === 'coil' ? '🔩' : '📄'} {search.width_mm || '—'}mm × {search.gauge_mm || '—'}mm — {search.item_type === 'coil' ? 'Coil' : 'Sheet'}
              <span className="text-steel-400 font-normal text-sm ml-2">({results.length} part{results.length === 1 ? 'y' : 'ies'})</span>
            </h2>
            <button onClick={() => window.print()} className="btn-primary text-sm no-print">🖨️ Print This List</button>
          </div>
          {results.length === 0 ? (
            <div className="text-center text-steel-400 py-6 no-print">No parties found for this size yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-steel-50 border-b border-steel-200">
                  <tr>
                    {['Party', 'Phone', 'Matched Size', 'Notes'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-steel-100">
                  {results.map(({ customer: c, matched }) => (
                    <tr key={c._id}>
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">{c.phone || '—'}</td>
                      <td className="px-3 py-2">{matched.map((s, i) => <div key={i}>{s.width_mm}mm × {s.thickness_mm}mm</div>)}</td>
                      <td className="px-3 py-2 text-steel-500">{matched.map(s => s.notes).filter(Boolean).join('; ') || '—'}</td>
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
              <div className="flex gap-1">
                <button onClick={() => openEdit(c)} className="btn-secondary px-2 py-1 text-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Remove party?')) deleteMut.mutate(c._id); }} className="btn-danger px-2 py-1 text-xs">Del</button>
              </div>
            </div>

            {c.preferred_sizes?.length > 0 && (
              <div>
                <div className="text-xs font-medium text-steel-500 mb-1 uppercase">Sizes Used</div>
                <div className="flex flex-wrap gap-1">
                  {c.preferred_sizes.map((s, i) => (
                    <span key={i} className="bg-steel-100 text-steel-700 text-xs px-2 py-0.5 rounded">
                      {s.item_type === 'sheet' ? '📄' : '🔩'} {s.width_mm && `${s.width_mm}mm`}{s.thickness_mm && ` × ${s.thickness_mm}mm`}
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
              <button type="button" onClick={addSize} className="btn-secondary text-xs">+ Add Size</button>
            </div>
            {form.preferred_sizes.map((s, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-2 p-2 bg-steel-50 rounded-lg">
                <div>
                  <label className="text-xs text-steel-500">Type</label>
                  <select className="select" value={s.item_type || 'coil'} onChange={e => updateSize(i, 'item_type', e.target.value)}>
                    <option value="coil">🔩 Coil</option>
                    <option value="sheet">📄 Sheet</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-steel-500">Width (mm)</label>
                  <input type="number" className="input" step="0.1" value={s.width_mm} onChange={e => updateSize(i, 'width_mm', e.target.value)} placeholder="mm" />
                </div>
                <div>
                  <label className="text-xs text-steel-500">Gauge/Thickness (mm)</label>
                  <input type="number" className="input" step="0.01" value={s.thickness_mm} onChange={e => updateSize(i, 'thickness_mm', e.target.value)} placeholder="mm" />
                </div>
                <div className="sm:col-span-1">
                  <label className="text-xs text-steel-500">Notes</label>
                  <input className="input" value={s.notes || ''} onChange={e => updateSize(i, 'notes', e.target.value)} placeholder="optional" />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={() => removeSize(i)} className="btn-danger px-3 py-2 text-xs w-full">Remove</button>
                </div>
              </div>
            ))}
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
