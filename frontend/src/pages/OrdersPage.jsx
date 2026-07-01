import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ordersAPI, customersAPI } from '../services/api';
import { HARDNESS_LABELS, displayWeight } from '../utils/units';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

const HARDNESS_LIST = ['soft', 'semi_soft', 'medium', 'medium_hard', 'hard'];
const STATUS_LIST = ['pending', 'in_production', 'ready', 'dispatched'];

const emptyLineItem = {
  width_mm: '', length_mm: '', thickness_mm: '', hardness: 'soft',
  qty_kg: '', qty_tolerance_pct: 20,
  width_tolerance_mm: 0.2, length_tolerance_mm: 0.5, gauge_tolerance_mm: 0.1,
};

const emptyForm = { customer: '', deadline: '', priority: 'normal', line_items: [{ ...emptyLineItem }], notes: '' };

export default function OrdersPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [filter, setFilter] = useState({ status: '', priority: '' });

  const { data: orders, isLoading } = useQuery({
    queryKey: ['orders', filter],
    queryFn: () => ordersAPI.getAll(filter).then(r => r.data),
  });
  const { data: customers } = useQuery({ queryKey: ['customers'], queryFn: () => customersAPI.getAll().then(r => r.data) });

  const createMut = useMutation({ mutationFn: ordersAPI.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Order created'); setShowModal(false); }, onError: e => toast.error(e.response?.data?.message || 'Error') });
  const updateMut = useMutation({ mutationFn: ({ id, data }) => ordersAPI.update(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Updated'); setShowModal(false); }, onError: e => toast.error(e.response?.data?.message || 'Error') });
  const statusMut = useMutation({ mutationFn: ({ id, status }) => ordersAPI.updateStatus(id, status), onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Status updated'); }, onError: e => toast.error(e.response?.data?.message || 'Error') });
  const deleteMut = useMutation({ mutationFn: ordersAPI.delete, onSuccess: () => { qc.invalidateQueries({ queryKey: ['orders'] }); toast.success('Deleted'); }, onError: e => toast.error(e.response?.data?.message || 'Error') });

  const openAdd = () => { setEditing(null); setForm({ ...emptyForm, line_items: [{ ...emptyLineItem }] }); setShowModal(true); };
  const openEdit = (order) => {
    setEditing(order._id);
    setForm({ customer: order.customer?._id || order.customer, deadline: order.deadline?.slice(0, 10) || '', priority: order.priority, line_items: order.line_items, notes: order.notes || '' });
    setShowModal(true);
  };

  const updateLI = (i, key, val) => setForm(f => { const items = [...f.line_items]; items[i] = { ...items[i], [key]: val }; return { ...f, line_items: items }; });

  return (
    <div>
      <PageHeader
        title="Orders (ऑर्डर)"
        subtitle={`${orders?.length || 0} orders`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="btn-secondary hidden sm:flex">🖨️ Print</button>
            <button onClick={openAdd} className="btn-primary">+ New Order</button>
          </div>
        }
      />

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-28">
            <label className="label">Status</label>
            <select className="select" value={filter.status} onChange={e => setFilter(f => ({ ...f, status: e.target.value }))}>
              <option value="">All</option>
              {STATUS_LIST.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-28">
            <label className="label">Priority</label>
            <select className="select" value={filter.priority} onChange={e => setFilter(f => ({ ...f, priority: e.target.value }))}>
              <option value="">All</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
          </div>
          <button onClick={() => setFilter({ status: '', priority: '' })} className="btn-secondary self-end">Clear</button>
        </div>
      </div>

      <div className="space-y-3">
        {isLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {orders?.length === 0 && <div className="card text-center text-steel-400 py-12">No orders</div>}
        {orders?.map(order => (
          <div key={order._id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="font-bold text-lg">{order.order_number}</span>
                  {order.priority === 'high' && <span className="badge-high">🔴 High</span>}
                  <span className={`badge-${order.status}`}>{order.status.replace('_', ' ')}</span>
                </div>
                <div className="text-steel-600 text-sm">
                  <span className="font-medium">{order.customer?.name}</span>
                  {order.deadline && <span className="ml-2 text-steel-400">Due: {new Date(order.deadline).toLocaleDateString()}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {order.line_items?.map((li, i) => (
                    <div key={i} className="bg-steel-50 rounded px-2 py-1 text-xs">
                      <span className="font-medium">{li.width_mm}mm</span>
                      {li.length_mm && <span>×{li.length_mm}mm</span>}
                      <span> | {li.thickness_mm}mm | {HARDNESS_LABELS[li.hardness]} | {displayWeight(li.qty_kg)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                <select className="select text-xs w-36" value={order.status} onChange={e => statusMut.mutate({ id: order._id, status: e.target.value })}>
                  {STATUS_LIST.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                </select>
                <a href="/optimization" className="btn-primary text-xs">⚡ Optimize</a>
                <button onClick={() => openEdit(order)} className="btn-secondary text-xs">Edit</button>
                <button onClick={() => { if (window.confirm('Delete?')) deleteMut.mutate(order._id); }} className="btn-danger text-xs">Del</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Order' : 'New Order'} size="xl">
        <form onSubmit={e => { e.preventDefault(); editing ? updateMut.mutate({ id: editing, data: form }) : createMut.mutate(form); }} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Party / Customer <span className="text-red-500">*</span></label>
              <select className="select" value={form.customer} onChange={e => setForm(f => ({ ...f, customer: e.target.value }))} required>
                <option value="">— Select Party —</option>
                {customers?.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="select" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}>
                <option value="normal">Normal</option>
                <option value="high">🔴 High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Deadline</label>
            <input type="date" className="input" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-semibold">Line Items</h4>
              <button type="button" onClick={() => setForm(f => ({ ...f, line_items: [...f.line_items, { ...emptyLineItem }] }))} className="btn-secondary text-xs">+ Add Size</button>
            </div>
            <div className="space-y-3">
              {form.line_items.map((li, i) => (
                <div key={i} className="border border-steel-200 rounded-lg p-3 bg-steel-50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-steel-700">Item {i + 1}</span>
                    {form.line_items.length > 1 && (
                      <button type="button" onClick={() => setForm(f => ({ ...f, line_items: f.line_items.filter((_, idx) => idx !== i) }))} className="btn-danger text-xs px-2 py-1">Remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="text-xs text-steel-600">Width mm *</label>
                      <input type="number" className="input" step="0.1" value={li.width_mm} onChange={e => updateLI(i, 'width_mm', e.target.value)} required placeholder="47" />
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Length mm</label>
                      <input type="number" className="input" step="0.1" value={li.length_mm} onChange={e => updateLI(i, 'length_mm', e.target.value)} placeholder="optional" />
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Thickness mm *</label>
                      <input type="number" className="input" step="0.01" value={li.thickness_mm} onChange={e => updateLI(i, 'thickness_mm', e.target.value)} required placeholder="1.5" />
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Hardness</label>
                      <select className="select" value={li.hardness} onChange={e => updateLI(i, 'hardness', e.target.value)}>
                        {HARDNESS_LIST.map(h => <option key={h} value={h}>{HARDNESS_LABELS[h]}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Qty (kg) *</label>
                      <input type="number" className="input" step="0.1" value={li.qty_kg} onChange={e => updateLI(i, 'qty_kg', e.target.value)} required placeholder="500" />
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Width Tol. ±mm</label>
                      <input type="number" className="input" step="0.1" value={li.width_tolerance_mm} onChange={e => updateLI(i, 'width_tolerance_mm', e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs text-steel-600">Gauge Tol. −mm</label>
                      <input type="number" className="input" step="0.01" value={li.gauge_tolerance_mm} onChange={e => updateLI(i, 'gauge_tolerance_mm', e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">{editing ? 'Update Order' : 'Create Order'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
