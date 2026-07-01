import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { customersAPI } from '../services/api';
import { HARDNESS_LABELS } from '../utils/units';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];
const emptyForm = { name: '', contact: '', phone: '', address: '', preferred_sizes: [], notes: '' };
const emptySize = { width_mm: '', thickness_mm: '', hardness: 'soft', notes: '' };

export default function CustomersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState(null);

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

  return (
    <div>
      <PageHeader
        title="Parties / Customers (पार्टी)"
        subtitle={`${customers?.length || 0} parties`}
        actions={<button onClick={openAdd} className="btn-primary">+ Add Party</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
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
                <div className="text-xs font-medium text-steel-500 mb-1 uppercase">Preferred Sizes</div>
                <div className="flex flex-wrap gap-1">
                  {c.preferred_sizes.map((s, i) => (
                    <span key={i} className="bg-steel-100 text-steel-700 text-xs px-2 py-0.5 rounded">
                      {s.width_mm && `W:${s.width_mm}mm`}{s.thickness_mm && ` T:${s.thickness_mm}mm`} {HARDNESS_LABELS[s.hardness] || ''}
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
              <label className="label mb-0">Preferred Sizes</label>
              <button type="button" onClick={addSize} className="btn-secondary text-xs">+ Add Size</button>
            </div>
            {form.preferred_sizes.map((s, i) => (
              <div key={i} className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2 p-2 bg-steel-50 rounded-lg">
                <div>
                  <label className="text-xs text-steel-500">Width (mm)</label>
                  <input type="number" className="input" step="0.1" value={s.width_mm} onChange={e => updateSize(i, 'width_mm', e.target.value)} placeholder="mm" />
                </div>
                <div>
                  <label className="text-xs text-steel-500">Thickness (mm)</label>
                  <input type="number" className="input" step="0.01" value={s.thickness_mm} onChange={e => updateSize(i, 'thickness_mm', e.target.value)} placeholder="mm" />
                </div>
                <div>
                  <label className="text-xs text-steel-500">Hardness</label>
                  <select className="select" value={s.hardness} onChange={e => updateSize(i, 'hardness', e.target.value)}>
                    {HARDNESS_LIST.map(h => <option key={h} value={h}>{HARDNESS_LABELS[h]}</option>)}
                  </select>
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
