/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useEffect, useState } from 'react';
import {
  Sliders,
  Bell,
  Mail,
  Shield,
  CheckCircle,
  HelpCircle,
  Compass,
  FileText,
  Lock,
  Globe,
  AlertTriangle,
  UserCheck
} from 'lucide-react';

export default function SettingsView({ smsNumber, onUpdateSMSNumber }) {
  const [geofenceRadius, setGeofenceRadius] = useState(150);
  const [disableGeofenceMock, setDisableGeofenceMock] = useState(false);
  const [enableSMSDispatch, setEnableSMSDispatch] = useState(true);
  const [enableSoundAlerts, setEnableSoundAlerts] = useState(true);
  const [cscFormSync, setCscFormSync] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Simulated official division configurations
  const [selectedRegion, setSelectedRegion] = useState("Region IV-B (Mimaropa)");
  const [assignedOffice, setAssignedOffice] = useState("DILG Provincial LGU Coordination Office - Marinduque");
  const [cscApprover, setCscApprover] = useState("Atty. Manuel G. Santos, Regional Director");

  // The number is edited locally and saved once on Save, not on every keystroke.
  const [smsDraft, setSmsDraft] = useState(smsNumber || '');
  useEffect(() => {
    setSmsDraft(smsNumber || '');
  }, [smsNumber]);

  const handleSave = (e) => {
    e.preventDefault();
    const nextNumber = smsDraft.trim();
    if (nextNumber !== (smsNumber || '')) onUpdateSMSNumber(nextNumber);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 p-4 pb-32 font-sans text-left sm:p-6 sm:pb-8 lg:p-8">
      
      {/* Top Advisory Banner */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">Terminal Authenticated Session</span>
          </div>
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-wide">
            Employee Settings
          </h2>
          <p className="text-xs text-slate-505">
            Manage your attendance, notifications, and employee account preferences.
          </p>
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-100 bg-blue-50 text-[#1e40af] text-xs font-bold">
          <Shield className="w-4 h-4 text-[#1e40af]" />
          <span>CSC-Compliant V.2026</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Settings Form */}
        <div className="lg:col-span-2 bg-white border border-slate-200 p-6 shadow-sm rounded-2xl space-y-6">
          <form onSubmit={handleSave} className="space-y-6">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-md flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#1e40af]" />
                Attendance & Notification Preferences
              </h3>
              <p className="text-xs text-slate-505 mt-1">Update the preferences used by your employee workspace.</p>
            </div>

            <div className="space-y-6 text-xs text-slate-600 font-bold">
              
              {/* Geofencing Slider Configuration */}
              <div className="p-4 bg-slate-50 rounded-xl space-y-3.5 border border-slate-200 text-left">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-[#1e40af]" />
                    <h4 className="text-xs font-extrabold uppercase text-slate-800 tracking-wider">
                      Attendance Location Radius
                    </h4>
                  </div>
                  <span className="text-[9px] bg-blue-50 text-[#1e40af] border border-blue-100 px-2 py-0.5 rounded font-mono uppercase font-bold">
                    Attendance setting
                  </span>
                </div>
                <p className="text-[11px] text-[#475569] leading-relaxed font-semibold max-w-2xl font-sans">
                  The maximum physical distance allowed between the officer's real-time mobile coordinates and the target municipal LGU administrative structure for the system to validate attendance records.
                </p>
                
                <div className="space-y-2.5 max-w-md pt-2">
                  <div className="flex justify-between items-center text-xs font-mono text-slate-550">
                    <span>Min Tolerance: 50m</span>
                    <span className="text-[#1e40af] font-black underline">Active limit: {geofenceRadius} meters</span>
                    <span>Max Tolerance: 500m</span>
                  </div>
                  <input
                    id="slider-geofence"
                    type="range"
                    min="50"
                    max="500"
                    step="25"
                    value={geofenceRadius}
                    onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#1e40af]"
                  />
                  <p className="text-[10px] text-slate-400 italic leading-normal font-medium">
                    Your attendance is validated using your assigned work location.
                  </p>
                </div>
              </div>

              {/* Grid 2x2 for parameters list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                
                {/* CSC Directives */}
                <div className="space-y-4">
                  <h4 className="font-extrabold text-slate-705 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 pb-1.5 matches-csc-audit">
                    <FileText className="w-4 h-4 text-[#1e40af]" />
                    Attendance Preferences
                  </h4>

                  <div className="space-y-3 font-medium text-slate-600">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        id="opt-csc-sync"
                        type="checkbox"
                        checked={cscFormSync}
                        onChange={(e) => setCscFormSync(e.target.checked)}
                        className="w-4.5 h-4.5 text-[#1e40af] border-slate-355 bg-slate-50 rounded focus:ring-blue-500 cursor-pointer accent-[#1e40af] mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="block font-bold text-slate-705">DTR synchronization</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-relaxed font-semibold">Keep your attendance records ready for official DTR processing.</span>
                      </div>
                    </label>

                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        id="opt-sound"
                        type="checkbox"
                        checked={enableSoundAlerts}
                        onChange={(e) => setEnableSoundAlerts(e.target.checked)}
                        className="w-4.5 h-4.5 text-[#1e40af] border-slate-355 bg-slate-50 rounded focus:ring-blue-500 cursor-pointer accent-[#1e40af] mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="block font-bold text-slate-705">Attendance sound alerts</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-relaxed font-semibold">Play a sound after successful attendance verification.</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Secure SMS Gateway / Advisories */}
                <div className="space-y-4">
                  <h4 className="font-extrabold text-slate-705 uppercase tracking-wider text-[11px] flex items-center gap-2 border-b border-slate-100 pb-1.5">
                    <Mail className="w-4 h-4 text-sky-600" />
                    Notification Preferences
                  </h4>

                  <div className="space-y-3 font-medium text-slate-600">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        id="opt-sms"
                        type="checkbox"
                        checked={enableSMSDispatch}
                        onChange={(e) => setEnableSMSDispatch(e.target.checked)}
                        className="w-4.5 h-4.5 text-blue-600 border-slate-300 bg-slate-50 rounded focus:ring-blue-500 cursor-pointer accent-[#1e40af] mt-0.5"
                      />
                      <div className="text-xs">
                        <span className="block font-bold text-slate-705">SMS notifications</span>
                        <span className="text-[10px] text-slate-500 block mt-0.5 leading-relaxed font-semibold">Receive attendance and official account updates by SMS.</span>
                      </div>
                    </label>

                    {enableSMSDispatch && (
                      <div className="space-y-1.5 pl-7 animate-in fade-in duration-200">
                        <label className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">Your mobile number</label>
                        <input
                          id="input-sms-number"
                          type="text"
                          required
                          value={smsDraft}
                          onChange={(e) => setSmsDraft(e.target.value)}
                           placeholder="+63 917 123 4567"
                          className="w-48 text-xs font-bold rounded-lg border border-slate-200 p-2 focus:ring-2 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold"
                        />
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {saveSuccess && (
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-3.5 rounded-xl text-xs font-bold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Government portal parameters committed successfully to local browser registry.</span>
              </div>
            )}

            {/* Action Trigger Row */}
            <div className="pt-4 border-t border-slate-100 flex justify-between items-center text-xs">
              <span className="text-slate-405 font-medium font-sans">Changes apply to this employee account.</span>
              <button
                id="btn-settings-save"
                type="submit"
                className="px-5 py-3 bg-[#1e40af] hover:bg-blue-800 transition-all text-white font-bold text-xs rounded-lg cursor-pointer shadow-xs flex items-center gap-1.5 font-semibold border-0"
              >
                <CheckCircle className="w-3.5 h-3.5 text-white" />
                <span>Save Settings</span>
              </button>
            </div>
          </form>
        </div>

        {/* Official Office Details and Security Metadata (Right column) */}
        <div className="space-y-8 text-left">
          
          {/* Government LGU Coordination Info Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h4 className="font-extrabold text-slate-805 text-xs uppercase tracking-wider font-mono border-b border-slate-100 pb-2.5 flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-600" />
              Official Assignee Details
            </h4>

            <div className="space-y-3 font-mono text-[11px]">
              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Registered Region Office</span>
                <select 
                  value={selectedRegion}
                  onChange={(e) => setSelectedRegion(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-800 focus:outline-none"
                >
                  <option value="Region IV-B (Mimaropa)">Region IV-B (Mimaropa)</option>
                  <option value="Region IV-A (Calabarzon)">Region IV-A (Calabarzon)</option>
                  <option value="Region NCR (National Capital)">Region NCR (National Capital)</option>
                </select>
              </div>

              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">LGU Sub-Office Assignment</span>
                <input
                  type="text"
                  value={assignedOffice}
                  onChange={(e) => setAssignedOffice(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-800 focus:outline-none"
                />
              </div>

              <div>
                <span className="text-slate-400 block text-[9px] uppercase font-bold">Authorized CSC Signing Approver</span>
                <input
                  type="text"
                  value={cscApprover}
                  onChange={(e) => setCscApprover(e.target.value)}
                  className="mt-1 w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-800 focus:outline-none"
                />
              </div>

              <div className="pt-2 bg-blue-50/50 p-2.5 rounded border border-blue-100 text-[10px] text-slate-600 leading-normal font-sans">
                ⚠️ Information provided above formats the auto-generated monthly DTR PDF and oficial personnel lists. Ensure credentials match your Civil Service appointment document.
              </div>
            </div>
          </div>

          {/* Secure Technical System Audit & Protocol Compliance */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3 text-left">
            <h4 className="font-extrabold text-slate-805 text-xs uppercase tracking-wider font-mono flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Cybersecurity Compliance
            </h4>
            <div className="space-y-2 text-[11px] text-slate-550 leading-relaxed font-sans font-medium">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>DESKTOP ID Tagged Secure</span>
              </div>
              <p className="leading-relaxed font-semibold">
                In compliance with DICT security memorandum, all biometric face scan tokens and physical thumb fingerprints are stored under sandboxed environment using high-entropy SHA256 hashing. No biometrics are exported over insecure cloud networks.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
