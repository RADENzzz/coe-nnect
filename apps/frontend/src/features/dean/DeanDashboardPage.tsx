import { useState } from 'react';

export default function DeanDashboardPage() {
  const [activeTab, setActiveTab] = useState('departments');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-on-surface">Dean Dashboard</h1>
      <p className="text-on-surface-variant text-sm mt-1">
        Overview and management of your college.
      </p>

      {/* Tabs */}
      <div className="flex border-b border-surface-variant gap-6">
        <button
          onClick={() => setActiveTab('departments')}
          className={`py-2 text-sm font-medium transition-all ${
            activeTab === 'departments'
              ? 'border-b-2 border-primary text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Department Tracking
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`py-2 text-sm font-medium transition-all ${
            activeTab === 'users'
              ? 'border-b-2 border-primary text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          User Management
        </button>
        <button
          onClick={() => setActiveTab('approvals')}
          className={`py-2 text-sm font-medium transition-all ${
            activeTab === 'approvals'
              ? 'border-b-2 border-primary text-primary'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          Schedule Approvals
        </button>
      </div>

      {/* Content */}
      <div className="pt-4">
        {activeTab === 'departments' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Department Analytics</h2>
            {/* List/grid of departments will go here */}
            <p className="text-sm text-on-surface-variant">
              (Feature implementation placeholder for Department Analytics)
            </p>
          </div>
        )}
        
        {activeTab === 'users' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">User & Account Management</h2>
            <p className="text-sm text-on-surface-variant">
              (Feature implementation placeholder for User Management)
            </p>
          </div>
        )}

        {activeTab === 'approvals' && (
          <div>
            <h2 className="text-lg font-semibold mb-4">Schedule Approvals Queue</h2>
            <p className="text-sm text-on-surface-variant">
              (Feature implementation placeholder for Schedule Approvals)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
