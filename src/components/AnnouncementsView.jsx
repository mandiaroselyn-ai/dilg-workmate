/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Megaphone,
  Search,
  Filter,
  CheckCircle,
  FileCheck2,
  Calendar,
  Layers,
  ChevronDown,
  ChevronUp,
  Award,
  Pin
} from 'lucide-react';

export default function AnnouncementsView({
  announcements,
  acknowledgedIds = [],
  onAcknowledge
}) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  // Newest first, like a notice board.
  const visibleAnnouncements = [...(announcements || [])].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // Filter announcements
  const filteredAnnouncements = visibleAnnouncements.filter(ann => {
    const textToSearch = `${ann.title} ${ann.content || ann.description || ''} ${ann.referenceNo || ''}`.toLowerCase();
    const matchesSearch = textToSearch.includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'All' ? true : ann.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 pb-32 font-sans sm:p-6 sm:pb-8 lg:p-8">
      
      {/* Top Banner and Navigation category tabs */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5 border-b border-slate-200 pb-5">
        <div>
          <h2 className="text-xl font-bold text-slate-800 tracking-tight">DILG Official Public Bulletins</h2>
          <p className="text-xs text-slate-500 mt-1">Official circulars, regulatory guidelines, administrative directives, and regional announcements.</p>
        </div>

        {/* Categories Tab Selector */}
        <div className="flex flex-wrap gap-2">
          {['All', 'Memorandum Circular', 'Department Order', 'Advisory', 'Directive', 'Meeting', 'Training', 'Guidelines'].map(cat => (
            <button
              key={cat}
              id={`cat-tab-${cat}`}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                activeCategory === cat
                  ? 'bg-[#1e40af] text-white border-transparent shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-805'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Control Utility Toolbar (Search & Statistics) */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-center">
        
        {/* Search input field */}
        <div className="lg:col-span-3 relative">
          <Search className="w-4.5 h-4.5 text-slate-450 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-announcements"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search bulletins by title, memo reference ID, or content..."
            className="w-full text-xs font-semibold rounded-lg border border-slate-200 pl-10 pr-4 py-3 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] transition-all bg-slate-50 text-slate-800 placeholder:text-slate-400"
          />
        </div>

        {/* Read statistic widget */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center flex items-center justify-around text-xs">
          <div>
            <span className="text-[10px] text-slate-500 font-bold block">BULLETINS</span>
            <span className="text-sm font-extrabold text-slate-800">{filteredAnnouncements.length} Available</span>
          </div>
          <div className="h-6 w-px bg-slate-200"></div>
          <div>
            <span className="text-[10px] text-slate-500 font-bold block">READ RECEIPTED</span>
            <span className="text-sm font-extrabold text-[#111827]">{acknowledgedIds.length} Signed</span>
          </div>
        </div>
      </div>

      {/* Bulletin Grid Structure */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        
        {filteredAnnouncements.length === 0 ? (
          <div className="md:col-span-2 p-16 text-center text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-slate-55 space-y-2">
            <Megaphone className="w-8 h-8 text-slate-500 mx-auto animate-pulse" />
            <p className="font-bold text-sm text-slate-800">{visibleAnnouncements.length === 0 ? 'No official circulars yet.' : 'No bulletins match your query.'}</p>
            <p className="text-xs">{visibleAnnouncements.length === 0 ? 'Official circulars from HR will appear here.' : 'Adjust filters or search criteria to query larger database indexes.'}</p>
          </div>
        ) : (
          filteredAnnouncements.map((ann) => {
            const isExpanded = expandedId === ann.id;
            const isAcknowledged = acknowledgedIds.includes(ann.id);

            return (
              <div
                key={ann.id}
                id={`ann-card-${ann.id}`}
                className={`bg-white border transition-all duration-200 overflow-hidden relative shadow-sm rounded-2xl hover:bg-slate-50/10 hover:shadow-md ${
                  ann.important ? 'border-amber-400 ring-1 ring-amber-400/15' : 'border-slate-200'
                }`}
              >
                {/* Visual Pin Overlay for important bulletins */}
                {ann.important && (
                  <div className="absolute top-0 right-0 py-1 px-3 bg-gradient-to-r from-amber-500 to-yellow-600 rounded-bl text-[9px] font-black text-slate-950 tracking-wider uppercase flex items-center gap-1 shadow-md">
                    <Pin className="w-2.5 h-2.5 fill-slate-950 shrink-0" />
                    <span>URGENT</span>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {/* Category, Date, Reference info */}
                  <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold">
                    <span className={`px-2.5 py-0.5 rounded uppercase font-extrabold tracking-wider ${
                      ann.category === 'Guidelines' ? 'bg-slate-100 text-slate-700' :
                      ann.category === 'Memorandum Circular' ? 'bg-blue-50 text-blue-700' :
                      ann.category === 'Department Order' ? 'bg-indigo-50 text-indigo-700' :
                      ann.category === 'Department Circular' ? 'bg-blue-50 text-blue-700' :
                      ann.category === 'Advisory' ? 'bg-sky-50 text-sky-700' :
                      ann.category === 'Directive' ? 'bg-violet-50 text-violet-700' :
                      ann.category === 'Special Order' ? 'bg-purple-50 text-purple-700' :
                      ann.category === 'Meeting' ? 'bg-emerald-50 text-emerald-700' :
                      ann.category === 'Training' ? 'bg-teal-50 text-teal-700' : 'bg-rose-50 text-rose-700'
                    }`}>
                      {ann.category}
                    </span>
                    <span>•</span>
                    <span>Date: {ann.date}</span>
                    {ann.referenceNo && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-slate-500">{ann.referenceNo}</span>
                      </>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-extrabold text-sm text-slate-800 hover:text-[#1e40af] transition-colors leading-snug">
                    {ann.title}
                  </h3>

                  {/* Snippet / Expanded Content */}
                  <div className="text-xs text-slate-650 leading-relaxed font-semibold">
                    {isExpanded ? (
                      <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 font-sans whitespace-pre-line text-slate-700 shadow-inner leading-relaxed">
                        {ann.content || ann.description}
                      </div>
                    ) : (
                      <p className="line-clamp-2">
                        {ann.content || ann.description}
                      </p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    {/* Read receipt check */}
                    <div>
                      {!onAcknowledge ? null : isAcknowledged ? (
                        <span className="text-[10px] text-emerald-800 font-bold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-100 shadow-sm">
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>Receipt Confirmed</span>
                        </span>
                      ) : (
                        <button
                          id={`btn-ack-${ann.id}`}
                          onClick={() => onAcknowledge(ann.id)}
                          className="text-[10px] text-slate-700 hover:text-slate-900 font-bold flex items-center gap-1.5 hover:bg-slate-50 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer border border-slate-200 bg-white"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>Acknowledge Receipt</span>
                        </button>
                      )}
                    </div>

                    {/* Toggle expanding button */}
                    <button
                      id={`btn-toggle-expand-${ann.id}`}
                      onClick={() => toggleExpand(ann.id)}
                      className="text-xs font-bold text-[#1e40af] hover:text-blue-800 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Close Circular' : 'Read Full Circular'}</span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-blue-600" /> : <ChevronDown className="w-3.5 h-3.5 text-blue-500" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

    </div>
  );
}
