import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { suppliersAPI } from '../services/api';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const emptyForm = { name: '', contact: '', phone: '', address: '', notes: '' };

export default function SuppliersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: suppliers, isLoading } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => suppliersAPI.getAll().then(r => r.data),
  });

  const createMut = useMutation({
    mutationFn: suppliersAPI.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Supplier added'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => suppliersAPI.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Updated'); setShowModal(false); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: suppliersAPI.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['suppliers'] }); toast.success('Removed'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const handleSubmit = e => {
    e.preventDefault();
    if (editing) updateMut.mutate({ id: editing, data: form });
    else createMut.mutate(form);
  };

  return (
    <div>
      <PageHeader
        title="Suppliers (सप्लायर)"
        actions={<button onClick={() => { setEditing(null); setForm(emptyForm); setShowModal(true); }} className="btn-primary">+ Add Supplier</button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {isLoading && <div className="card col-span-3 text-center text-steel-400">Loading...</div>}
        {suppliers?.length === 0 && <div className="card col-span-3 text-center text-steel-400 py-12">No suppliers yet</div>}
        {suppliers?.map(s => (
          <div key={s._id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">{s.name}</h3>
                {s.phone && <div className="text-sm text-steel-500">📞 {s.phone}</div>}
                {s.contact && <div className="text-sm text-steel-500">👤 {s.contact}</div>}
                {s.address && <div className="text-sm text-steel-400 mt-1">{s.address}</div>}
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => { setEditing(s._id); setForm(s); setShowModal(true); }} className="btn-secondary btn-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Remove?')) deleteMut.mutate(s._id); }} className="btn-danger btn-xs">Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Supplier' : 'Add Supplier (सप्लायर जोड़ें)'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Contact</label><input className="input" value={form.contact || ''} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone || ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
          </div>
          <div><label className="label">Address</label><textarea className="input" rows={2} value={form.address || ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
          <div><label className="label">Notes</label><textarea className="input" rows={2} value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
