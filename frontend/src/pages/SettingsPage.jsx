import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { settingsAPI, authAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';

export default function SettingsPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'supervisor' });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsAPI.get().then(r => r.data),
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => authAPI.getUsers().then(r => r.data),
    enabled: isOwner,
  });

  useEffect(() => {
    if (settings && !form) setForm(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: settingsAPI.update,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.success('Settings saved'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const createUserMut = useMutation({
    mutationFn: authAPI.createUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User created'); setShowUserModal(false); setNewUser({ username: '', password: '', role: 'supervisor' }); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const deactivateUserMut = useMutation({
    mutationFn: authAPI.deactivateUser,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  if (!form) return <div className="text-steel-400">Loading settings...</div>;

  const updateBreak = (i, key, val) => {
    const breaks = [...form.break_times];
    breaks[i] = { ...breaks[i], [key]: val };
    setForm(f => ({ ...f, break_times: breaks }));
  };

  return (
    <div>
      <PageHeader title="Settings (सेटिंग)" subtitle="System configuration — Owner access required for changes" />

      {!isOwner && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4 text-yellow-700 text-sm">
          ⚠️ You have read-only access. Owner login required to change settings.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Settings */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-lg">General Settings</h2>

          <div>
            <label className="label">Default Unit</label>
            <select className="select" value={form.default_unit} onChange={e => setForm(f => ({ ...f, default_unit: e.target.value }))} disabled={!isOwner}>
              {['mm', 'cm', 'inches', 'feet', 'meters'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div>
            <label className="label">Working Hours / Day</label>
            <input type="number" className="input w-32" min="1" max="24" step="0.5"
              value={form.working_hours_per_day}
              onChange={e => setForm(f => ({ ...f, working_hours_per_day: parseFloat(e.target.value) }))}
              disabled={!isOwner}
            />
          </div>

          <div>
            <label className="label">Default Quantity Tolerance (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" className="input w-32" min="0" max="50"
                value={form.qty_tolerance_pct}
                onChange={e => setForm(f => ({ ...f, qty_tolerance_pct: parseInt(e.target.value) }))}
                disabled={!isOwner}
              />
              <span className="text-steel-500 text-sm">e.g. 20% = ±20% of ordered quantity</span>
            </div>
          </div>
        </div>

        {/* Break Times */}
        <div className="card">
          <h2 className="font-semibold text-lg mb-4">Break Times</h2>
          <div className="space-y-3">
            {form.break_times?.map((b, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-steel-50 rounded-lg">
                <input
                  type="checkbox"
                  checked={b.enabled}
                  onChange={e => updateBreak(i, 'enabled', e.target.checked)}
                  disabled={!isOwner}
                  className="w-4 h-4"
                />
                <input
                  className="input flex-1"
                  value={b.name}
                  onChange={e => updateBreak(i, 'name', e.target.value)}
                  disabled={!isOwner}
                />
                <div className="flex items-center gap-1">
                  <input
                    type="number" className="input w-20" min="0"
                    value={b.duration_min}
                    onChange={e => updateBreak(i, 'duration_min', parseInt(e.target.value))}
                    disabled={!isOwner}
                  />
                  <span className="text-steel-500 text-sm">min</span>
                </div>
              </div>
            ))}
          </div>
          <div className="text-xs text-steel-400 mt-2">
            Total break: {form.break_times?.filter(b => b.enabled).reduce((s, b) => s + b.duration_min, 0)} min
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="mt-4">
          <button onClick={() => saveMut.mutate(form)} className="btn-primary" disabled={saveMut.isPending}>
            {saveMut.isPending ? 'Saving...' : '💾 Save Settings'}
          </button>
        </div>
      )}

      {/* User Management */}
      {isOwner && (
        <div className="card mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">User Management</h2>
            <button onClick={() => setShowUserModal(true)} className="btn-primary text-sm">+ Add User</button>
          </div>
          <div className="space-y-2">
            {users?.map(u => (
              <div key={u._id} className="flex items-center justify-between p-3 bg-steel-50 rounded-lg">
                <div>
                  <span className="font-medium">{u.username}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded ${u.role === 'owner' ? 'bg-yellow-100 text-yellow-700' : 'bg-steel-200 text-steel-600'}`}>
                    {u.role === 'owner' ? '👑 Owner' : '🔧 Supervisor'}
                  </span>
                  {!u.isActive && <span className="ml-2 badge-inactive">Inactive</span>}
                </div>
                <div className="flex gap-2">
                  {u.isActive && (
                    <button onClick={() => { if (window.confirm(`Deactivate ${u.username}?`)) deactivateUserMut.mutate(u._id); }} className="btn-danger text-xs px-2 py-1">
                      Deactivate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Glossary */}
      <div className="card mt-6">
        <h2 className="font-semibold text-lg mb-4">Hindi Terms Glossary (हिंदी शब्दावली)</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            ['Material / Maal', 'माल'], ['Customer / Party', 'पार्टी'], ['Wastage', 'बर्बादी'],
            ['Cut', 'काटा'], ['Scrap', 'रद्दी / कबाड़'],
            ['Order', 'ऑर्डर'], ['Width', 'चौड़ाई'], ['Thickness / Gauge', 'मोटाई'], ['Supplier', 'सप्लायर'],
          ].map(([en, hi]) => (
            <div key={en} className="flex items-center justify-between p-2 bg-steel-50 rounded text-sm">
              <span className="text-steel-700">{en}</span>
              <span className="text-steel-900 font-medium">{hi}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Add User Modal */}
      <Modal open={showUserModal} onClose={() => setShowUserModal(false)} title="Add New User">
        <form onSubmit={e => { e.preventDefault(); createUserMut.mutate(newUser); }} className="space-y-4">
          <div>
            <label className="label">Username</label>
            <input className="input" value={newUser.username} onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" className="input" value={newUser.password} onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))} required />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="select" value={newUser.role} onChange={e => setNewUser(u => ({ ...u, role: e.target.value }))}>
              <option value="supervisor">Supervisor</option>
              <option value="owner">Owner</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowUserModal(false)} className="btn-secondary">Cancel</button>
            <button type="submit" className="btn-primary">Create User</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
