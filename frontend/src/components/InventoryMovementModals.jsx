import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { inventoryAPI } from '../services/api';
import { displayWeight } from '../utils/units';
import Modal from './Modal';

const MOVEMENT_LABELS = {
  purchase: 'Initial purchase',
  manual_in: '↩️ Moved In',
  manual_out: '↪️ Moved Out',
  job_deduction: 'Used (cutting job)',
  scrap: 'Scrap',
  adjustment: 'Adjustment',
  edit: '✏️ Edited',
};

// Quick weight in/out — for moving stock without opening the full edit form.
export function MoveModal({ item, kind, onClose }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState('in');
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');

  const moveMut = useMutation({
    mutationFn: (data) => (kind === 'coil' ? inventoryAPI.moveCoil(item._id, data) : inventoryAPI.moveSheet(item._id, data)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['inventory-stats'] });
      toast.success(direction === 'in' ? 'Stock moved in' : 'Stock moved out');
      onClose();
    },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const submit = e => {
    e.preventDefault();
    const w = parseFloat(weight);
    if (!(w > 0)) { toast.error('Enter a weight greater than 0'); return; }
    moveMut.mutate({ direction, weight_kg: w, notes });
  };

  return (
    <Modal open onClose={onClose} title={`Move Stock — ${item.width_mm}mm`} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm text-steel-500">Currently {displayWeight(item.remaining_weight_kg)} in stock.</div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDirection('in')} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${direction === 'in' ? 'border-green-500 bg-green-50 text-green-700' : 'border-steel-200 text-steel-500'}`}>↩️ Move In</button>
          <button type="button" onClick={() => setDirection('out')} className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 ${direction === 'out' ? 'border-red-500 bg-red-50 text-red-700' : 'border-steel-200 text-steel-500'}`}>↪️ Move Out</button>
        </div>
        <div>
          <label className="label">Weight (kg)</label>
          <input type="number" step="0.001" min="0" className="input" value={weight} onChange={e => setWeight(e.target.value)} autoFocus required />
        </div>
        <div>
          <label className="label">Reason / Notes</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder={direction === 'in' ? 'e.g. received from supplier' : 'e.g. used for local job'} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Cancel</button>
          <button type="submit" className="btn-primary" disabled={moveMut.isPending}>{moveMut.isPending ? 'Saving...' : 'Confirm'}</button>
        </div>
      </form>
    </Modal>
  );
}

// Full audit trail viewer — every change ever made to this item, and who made it.
export function HistoryModal({ itemId, kind, onClose }) {
  const { data: item, isLoading } = useQuery({
    queryKey: ['inventory-item', kind, itemId],
    queryFn: () => (kind === 'coil' ? inventoryAPI.getCoil(itemId) : inventoryAPI.getSheet(itemId)).then(r => r.data),
  });

  const movements = [...(item?.movements || [])].sort((a, b) => new Date(b.date) - new Date(a.date));

  return (
    <Modal open onClose={onClose} title={`History — ${item ? `${item.width_mm}mm` : '...'}`} size="lg">
      {isLoading ? (
        <div className="text-center text-steel-400 py-6">Loading...</div>
      ) : movements.length === 0 ? (
        <div className="text-center text-steel-400 py-6">No history recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {movements.map((m, i) => (
            <div key={i} className="border border-steel-200 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{MOVEMENT_LABELS[m.type] || m.type}</span>
                <span className="text-steel-400 text-xs">{new Date(m.date).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="text-steel-600 mt-1">{displayWeight(m.weight_kg)}{m.by?.username ? <span className="text-steel-400"> · by {m.by.username}</span> : ''}</div>
              {m.notes && <div className="text-steel-500 text-xs mt-1">{m.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
