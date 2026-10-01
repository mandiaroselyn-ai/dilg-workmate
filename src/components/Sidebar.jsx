/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect } from 'react';
import logoImage from '../assets/dilg-logo.png';
import {
  LayoutDashboard,
  Clock,
  FileText,
  Megaphone,
  Calendar,
  User,
  Settings,
  HelpCircle,
  BookOpen,
  FileArchive,
  UserCheck,
  ShieldAlert,
  ClipboardList,
  UserCog,
  FolderKanban,
  CalendarCheck,
  ContactRound,
  LogOut
} from 'lucide-react';

export default function Sidebar({ currentView, onViewChange, user, activeRole, onLogout, isOpen, onClose }) {
  const [showConfirmLogout, setShowConfirmLogout] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const updateMobile = () => setIsMobile(window.innerWidth < 768);
    updateMobile();
    window.addEventListener('resize', updateMobile);
    return () => window.removeEventListener('resize', updateMobile);
  }, []);

  // All potential items for desktop
  const allMenuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['employee'] },
    { id: 'supervisor', label: 'Supervisor Dashboard', icon: LayoutDashboard, roles: ['supervisor'] },
    { id: 'attendance', label: 'Attendance', icon: Clock, roles: ['employee'] },
    { id: 'requests', label: 'Requests', icon: FileText, roles: ['employee'] },
    { id: 'hr_admin', label: 'HR / Admin Desk', icon: ShieldAlert, roles: ['hr_admin'] },
    { id: 'announcements', label: 'Announcements', icon: Megaphone, roles: ['employee', 'supervisor'] },
    { id: 'documents', label: 'Documents', icon: FileArchive, roles: ['employee', 'hr_admin'] },
    { id: 'calendar', label: 'Calendar', icon: Calendar, roles: ['employee', 'supervisor'] },
    { id: 'profile', label: 'Profile', icon: User, roles: ['employee', 'supervisor', 'hr_admin'] },
    { id: 'settings', label: 'Settings', icon: Settings, roles: ['employee', 'hr_admin'] },
    { id: 'help', label: 'Help & Support', icon: HelpCircle, roles: ['employee', 'hr_admin'] },
  ];

  const hrWebMenuItems = [
    { id: 'hr_dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'hr_dtr', label: 'Attendance', icon: ClipboardList },
    { id: 'hr_records', label: 'Records', icon: FileArchive },
    { id: 'hr_employees', label: 'Employees', icon: UserCog },
    { id: 'hr_leave_records', label: 'Requests', icon: FileText },
    { id: 'hr_announcements', label: 'Announcements', icon: Megaphone },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'hr_profile', label: 'Profile', icon: User },
  ];

  const mobileMenuItems = [
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'documents', label: 'Documents', icon: FileArchive },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const mobileHrAdminItems = [
    { id: 'hr_admin', label: 'HR / Admin Desk', icon: ShieldAlert },
    { id: 'announcements', label: 'Announcements', icon: Megaphone },
    { id: 'documents', label: 'Documents', icon: FileArchive },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'help', label: 'Help & Support', icon: HelpCircle },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const isWebDesktopRole = activeRole === 'hr_admin' || activeRole === 'supervisor';

  const menuItems = isWebDesktopRole
    ? (activeRole === 'hr_admin' ? hrWebMenuItems : allMenuItems.filter(item => item.roles.includes(activeRole)))
    : (isMobile ? mobileMenuItems : allMenuItems.filter(item => item.roles.includes(activeRole)));

  return (
    <>
      <div className={`fixed inset-0 bg-slate-900/50 z-40 transition-opacity duration-300 md:hidden ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`} onClick={onClose} />
      <aside className={`fixed inset-y-0 left-0 w-[min(85vw,18rem)] max-w-[18rem] bg-white border-r border-slate-200/80 flex flex-col h-full z-50 transform transition-transform duration-300 md:static md:translate-x-0 md:w-64 md:h-screen md:flex ${isOpen ? 'translate-x-0' : '-translate-x-full'} id-sidebar`}>
        <div className="flex items-center justify-between p-5 border-b border-slate-100 md:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden">
              <img src={logoImage} alt="DILG logo" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-extrabold text-lg text-[#1e40af] leading-none tracking-tight">DILG</span>
              <span className="font-bold text-[10px] text-blue-600 uppercase tracking-widest mt-0.5">WorkMate</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-900 text-xl font-bold">×</button>
        </div>

        {/* Brand Header */}
        <div className="hidden md:flex items-center gap-4 px-7 py-6 border-b border-slate-100">
          <div className="w-12 h-12 rounded-full bg-white border border-slate-200 flex items-center justify-center overflow-hidden shadow-sm">
            <img src={logoImage} alt="DILG logo" className="w-full h-full object-contain" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-extrabold text-xl text-[#1e40af] tracking-tight">DILG</span>
            <span className="font-bold text-[10px] text-blue-600 uppercase tracking-[0.28em] mt-1">WorkMate</span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              id={`sidebar-item-${item.id}`}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-xl text-[14px] font-bold transition-all duration-200 group ${
                isActive
                  ? 'bg-[#1e40af] text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon 
                className={`w-[18px] h-[18px] shrink-0 transition-transform duration-250 ${
                  isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-700'
                }`}
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer Profile Brief & Logout */}
      <div className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/50">
        <div className="hidden md:flex items-center gap-3 px-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#1e40af] to-indigo-600 text-white font-bold flex items-center justify-center text-xs shadow-sm overflow-hidden">
            {user.profilePicture ? (
              <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              user.name.split(' ').map(n => n[0]).join('').substring(0, 2)
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-sm text-slate-800 truncate">{user.name}</span>
            <span className="text-[10px] text-slate-500 truncate">{user.role}</span>
          </div>
        </div>
        
        <button
          id="btn-sidebar-logout"
          onClick={() => {
            setShowConfirmLogout(true);
          }}
          className="flex w-full items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors duration-200 cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </button>
      </div>

    </aside>

      {/* Logout Confirmation Modal Overlay */}
      {showConfirmLogout && (
        <div className="fixed inset-0 bg-slate-950/30 backdrop-blur-sm flex items-center justify-center px-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-[32px] border border-slate-200/70 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.25)] w-full max-w-[min(420px,92vw)] p-6 text-center">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Log out?</h3>
              <p className="text-sm text-slate-500">Are you sure you want to log out?</p>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => setShowConfirmLogout(false)}
                className="flex-1 rounded-[18px] border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                No
              </button>
              <button
                onClick={() => {
                  setShowConfirmLogout(false);
                  onLogout();
                }}
                className="flex-1 rounded-[18px] bg-rose-600 px-4 py-3 text-sm font-semibold text-white hover:bg-rose-700 transition"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
