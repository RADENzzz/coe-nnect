import { useState } from 'react';

export default function DeanDashboardPage() {
  const [activeTab, setActiveTab] = useState('departments');

  const tabs = [
    { id: 'departments', label: 'Department Tracking' },
    { id: 'users', label: 'User Management' },
    { id: 'approvals', label: 'Schedule Approvals' },
  ];

  return (
    <div className="space-y-5">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Dean Dashboard</h1>
        <p className="text-sm text-slate-500 mt-0.5">Overview and management of your college.</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-xs font-semibold transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-[#5c1219] text-[#5c1219]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="pt-2">
        {activeTab === 'departments' && (
          <div className="bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight mb-3">Department Analytics</h2>
            <p className="text-sm text-slate-500">
              (Feature implementation placeholder for Department Analytics)
            </p>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight mb-3">User & Account Management</h2>
            <p className="text-sm text-slate-500">
              (Feature implementation placeholder for User Management)
            </p>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div className="bg-white border border-slate-200 p-5 shadow-sm">
            <h2 className="text-sm font-extrabold text-slate-900 tracking-tight mb-3">Schedule Approvals Queue</h2>
            <p className="text-sm text-slate-500">
              (Feature implementation placeholder for Schedule Approvals)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
