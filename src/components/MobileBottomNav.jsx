/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React from 'react';
import { LayoutDashboard, Clock, FileText, FolderKanban, User, UserCog } from 'lucide-react';

const defaultNavItems = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'attendance', label: 'Attendance', Icon: Clock },
  { id: 'requests', label: 'Requests', Icon: FileText },
  { id: 'profile', label: 'Profile', Icon: User }
];

const supervisorNavItems = [
  { id: 'supervisor', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'documents', label: 'Docs', Icon: FolderKanban },
  { id: 'announcements', label: 'News', Icon: Clock },
  { id: 'profile', label: 'Profile', Icon: User }
];

const hrAdminNavItems = [
  { id: 'hr_dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'hr_dtr', label: 'Attendance', Icon: Clock },
  { id: 'hr_leave_records', label: 'Requests', Icon: FileText },
  { id: 'hr_employees', label: 'Employees', Icon: UserCog },
  { id: 'hr_profile', label: 'Profile', Icon: User }
];

export default function MobileBottomNav({ currentView, onViewChange, activeRole }) {
  if (activeRole === 'hr_admin' || activeRole === 'supervisor') {
    return null;
  }

  const allowedNavItems = activeRole === 'hr_admin'
    ? hrAdminNavItems
    : activeRole === 'supervisor'
      ? supervisorNavItems
      : defaultNavItems;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 bg-white border-t border-slate-200 shadow-[0_-10px_30px_-24px_rgba(15,23,42,0.25)] sm:hidden">
      <div className="max-w-3xl mx-auto px-2 py-2 flex items-center justify-between gap-2">
        {allowedNavItems.map(({ id, label, Icon }) => {
          const isActive = currentView === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-3xl py-2 transition-all duration-200 ${
                isActive ? 'text-[#1e40af]' : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-label={label}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-[#1e40af]' : 'text-slate-500'}`} />
              <span className="text-[10px] font-semibold truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
