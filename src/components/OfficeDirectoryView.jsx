/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React from 'react';
import { Users } from 'lucide-react';

export default function OfficeDirectoryView() {
  return (
    <div className="p-8 space-y-6 overflow-y-auto flex-1 id-office-directory-view font-sans">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="w-12 h-12 rounded-3xl bg-[#1e40af] text-white flex items-center justify-center shadow-sm">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">Office Directory</h1>
          <p className="text-xs text-slate-500 font-semibold leading-relaxed max-w-xl">
            Browse DILG personnel offices, contact points, and nearby LGU collaborators from the mobile directory.
          </p>
        </div>
      </div>
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500 shadow-sm">
        <p className="font-semibold text-slate-700">Office directory search and contact listings are available here.</p>
        <p className="text-xs mt-3">Expand this page with office locations, phone numbers, and organizational units.</p>
      </div>
    </div>
  );
}
