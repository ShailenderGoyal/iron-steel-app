import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { productionAPI } from '../services/api';
import { displayWeight, JOB_STATUS_LABELS } from '../utils/units';
import { useAuth } from '../context/AuthContext';
import PageHeader from '../components/PageHeader';

const STATUS_COLORS = {
  planned: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
};

export default function ProductionPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['production-plan', planDate],
    queryFn: () => productionAPI.getPlan(planDate).then(r => r.data),
  });

  const { data: allJobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['production-jobs'],
    queryFn: () => productionAPI.getJobs({}).then(r => r.data),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => productionAPI.updateJob(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['production-jobs'] }); qc.invalidateQueries({ queryKey: ['production-plan'] }); toast.success('Updated'); },
    onError: e => toast.error(e.response?.data?.message || 'Error'),
  });

  const machineSchedules = plan?.schedule ? Object.values(plan.schedule) : [];

  return (
    <div>
      <PageHeader
        title="Production Plan (उत्पादन)"
        subtitle="Daily production schedule by machine"
        actions={
          <div className="flex gap-2 items-center no-print">
            <input type="date" className="input w-40" value={planDate} onChange={e => setPlanDate(e.target.value)} />
            <button onClick={() => window.print()} className="btn-secondary hidden sm:flex">🖨️ Print</button>
          </div>
        }
      />

      {/* Daily plan by machine */}
      <div className="space-y-4 mb-8">
        <h2 className="text-base font-semibold text-steel-700">
          {new Date(planDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h2>
        {planLoading && <div className="card text-center text-steel-400">Loading plan...</div>}
        {machineSchedules.length === 0 && !planLoading && (
          <div className="card text-center text-steel-400 py-12">No jobs scheduled — create orders and run optimization</div>
        )}
        {machineSchedules.map(machine => (
          <div key={machine.machine_id} className="card">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <h3 className="font-semibold">{machine.machine_name}</h3>
                <div className="text-xs text-steel-500">
                  Available: {machine.available_hrs}h | Used: {machine.used_hrs}h |
                  <span className={machine.remaining_hrs < 2 ? ' text-red-500 font-medium' : ' text-green-600'}>
                    {' '}Left: {machine.remaining_hrs}h
                  </span>
                </div>
              </div>
              {/* Capacity bar */}
              <div className="w-28 flex-shrink-0">
                <div className="h-2.5 bg-steel-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(machine.used_hrs / machine.available_hrs) > 0.9 ? 'bg-red-500' : 'bg-blue-500'}`}
                    style={{ width: `${Math.min((machine.used_hrs / machine.available_hrs) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {machine.jobs.length === 0 ? (
              <div className="text-sm text-steel-400 text-center py-4">No jobs today</div>
            ) : (
              <div className="space-y-2">
                {machine.jobs.map((job, ji) => (
                  <div key={ji} className={`p-3 rounded-lg border ${job.overflow ? 'border-red-200 bg-red-50' : 'border-steel-200 bg-steel-50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium text-sm">{job.job_number}</span>
                          {job.priority === 'high' && <span className="badge-high">🔴 High</span>}
                          {job.overflow && <span className="text-xs text-red-500 font-medium">⚠️ Overflow</span>}
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status]}`}>{job.status}</span>
                        </div>
                        <div className="text-xs text-steel-500 mt-0.5 truncate">
                          {job.order_number}{isOwner && job.customer ? ` | ${job.customer}` : ''}
                          {job.deadline && ` | Due: ${new Date(job.deadline).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div className="text-right text-sm flex-shrink-0">
                        {job.setup_time_hrs > 0 && <div className="text-xs text-steel-400">Setup: {job.setup_time_hrs}h</div>}
                        {job.estimated_time_hrs > 0 && <div className="font-medium">{job.estimated_time_hrs.toFixed(1)}h</div>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* All Jobs — mobile cards */}
      <div className="md:hidden space-y-3">
        <h2 className="text-base font-semibold">All Cutting Jobs</h2>
        {jobsLoading && <div className="card text-center text-steel-400">Loading...</div>}
        {allJobs?.length === 0 && <div className="card text-center text-steel-400 py-8">No jobs</div>}
        {allJobs?.map(job => (
          <div key={job._id} className="card">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="font-medium">{job.job_number}</div>
                {isOwner && <div className="text-xs text-steel-500">{job.order?.customer?.name}</div>}
              </div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] || ''}`}>{job.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm text-steel-600 mb-2">
              <div><span className="text-xs text-steel-400">Machine</span><div>{job.machine?.name}</div></div>
              <div><span className="text-xs text-steel-400">Est. Time</span><div>{job.estimated_time_hrs ? `${job.estimated_time_hrs.toFixed(1)}h` : '—'}</div></div>
              <div><span className="text-xs text-steel-400">Wastage</span><div className="text-orange-600">{job.wastage_pct ? `${job.wastage_pct.toFixed(1)}%` : '—'}</div></div>
              <div><span className="text-xs text-steel-400">Scheduled</span><div>{job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : '—'}</div></div>
            </div>
            <select
              className="select text-xs w-full"
              value={job.status}
              onChange={e => updateMut.mutate({ id: job._id, data: { status: e.target.value } })}
            >
              {['planned', 'in_progress', 'completed', 'cancelled'].map(s => (
                <option key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* All Jobs — desktop table */}
      <div className="hidden md:block card">
        <h2 className="text-lg font-semibold mb-4">All Cutting Jobs</h2>
        {jobsLoading && <div className="text-center text-steel-400">Loading...</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-steel-50 border-b border-steel-200">
              <tr>
                {['Job #', 'Order', ...(isOwner ? ['Customer'] : []), 'Machine', 'Status', 'Est. Time', 'Wastage', 'Sched.', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-steel-600 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-steel-100">
              {allJobs?.length === 0 && <tr><td colSpan={isOwner ? 9 : 8} className="px-4 py-8 text-center text-steel-400">No jobs</td></tr>}
              {allJobs?.map(job => (
                <tr key={job._id} className="hover:bg-steel-50">
                  <td className="px-4 py-3 font-medium">{job.job_number}</td>
                  <td className="px-4 py-3">{job.order?.order_number}</td>
                  {isOwner && <td className="px-4 py-3">{job.order?.customer?.name}</td>}
                  <td className="px-4 py-3">{job.machine?.name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[job.status] || ''}`}>{job.status}</span>
                  </td>
                  <td className="px-4 py-3">{job.estimated_time_hrs ? `${job.estimated_time_hrs.toFixed(1)}h` : '—'}</td>
                  <td className="px-4 py-3 text-orange-600">{job.wastage_pct ? `${job.wastage_pct.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-3 text-steel-500">{job.scheduled_date ? new Date(job.scheduled_date).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      className="select text-xs w-32"
                      value={job.status}
                      onChange={e => updateMut.mutate({ id: job._id, data: { status: e.target.value } })}
                    >
                      {['planned', 'in_progress', 'completed', 'cancelled'].map(s => (
                        <option key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
