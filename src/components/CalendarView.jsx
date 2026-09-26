/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Clock,
  MapPin,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Sliders,
  Check,
  Megaphone
} from 'lucide-react';

export default function CalendarView({ events, onAddEvent }) {
  // Use fallback sample events when `events` prop is empty (useful in local/dev without backend)
  let evtList = events && events.length ? events : [];
  try {
    if (!evtList || evtList.length === 0) {
      // lazy import to avoid circular issues
      // eslint-disable-next-line global-require
      const { DEFAULT_EVENTS } = require('../data');
      evtList = DEFAULT_EVENTS;
    }
  } catch (e) {
    // ignore if data import fails
  }
  const [currentYear, setCurrentYear] = useState(2026);
  const [currentMonth, setCurrentMonth] = useState(5); // 5 is June (0-based: 4 = May, 5 = June)
  const [selectedDayStr, setSelectedDayStr] = useState('2026-05-30'); // ISO format YYYY-MM-DD
  
  // Quick event form states
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00 AM');
  const [newType, setNewType] = useState('meeting');
  const [newDesc, setNewDesc] = useState('');
  const [newLoc, setNewLoc] = useState('Provincial Capitol office');
  const [formSuccess, setFormSuccess] = useState(false);

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(prev => prev - 1);
    } else {
      setCurrentMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(prev => prev + 1);
    } else {
      setCurrentMonth(prev => prev + 1);
    }
  };

  const daysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const firstDayIndex = (year, month) => {
    return new Date(year, month, 1).getDay();
  };

  // Build grid dates
  const totalDays = daysInMonth(currentYear, currentMonth);
  const firstDay = firstDayIndex(currentYear, currentMonth);
  
  const calendarCells = [];
  // Paddings left
  for (let i = 0; i < firstDay; i++) {
    calendarCells.push(null);
  }
  // Month days
  for (let d = 1; d <= totalDays; d++) {
    calendarCells.push(d);
  }

  const formatDayString = (day) => {
    const mm = String(currentMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${currentYear}-${mm}-${dd}`;
  };

  const handleDaySelect = (day) => {
    setSelectedDayStr(formatDayString(day));
  };

  const handleCreateEvent = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    onAddEvent({
      title: newTitle,
      date: selectedDayStr,
      time: newTime,
      type: newType,
      description: newDesc,
      location: newLoc
    });

    setNewTitle('');
    setNewDesc('');
    setNewLoc('Provincial Capitol office');
    setFormSuccess(true);
    setTimeout(() => {
      setFormSuccess(false);
    }, 3050);
  };

  // Get events on selected day
  const selectedDayEvents = evtList.filter(evt => evt.date === selectedDayStr);

  // Helper to find if a day has events
  const getEventsForDay = (day) => {
    if (!day) return [];
    const dateStr = formatDayString(day);
    return evtList.filter(evt => evt.date === dateStr);
  };

  return (
    <div className="p-8 pb-28 md:pb-8 space-y-8 overflow-y-auto flex-1 id-calendar-view font-sans">
      
      {/* 2-Column Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Monthly Grid Card (Takes 7/12 layout columns) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 p-6 shadow-sm rounded-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <CalendarIcon className="w-5 h-5 text-[#1e40af]" />
              <h3 className="font-extrabold text-slate-800 text-md">
                {monthNames[currentMonth]} {currentYear}
              </h3>
            </div>

            {/* Cycle triggers */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 p-1 rounded-lg">
              <button
                id="btn-cal-prev"
                onClick={handlePrevMonth}
                className="p-1.5 rounded-md hover:bg-slate-200/60 text-slate-600 hover:text-slate-800 transition-colors cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                id="btn-cal-next"
                onClick={handleNextMonth}
                className="p-1.5 rounded-md hover:bg-slate-200/60 text-slate-600 hover:text-slate-808 transition-colors cursor-pointer"
                title="Next Month"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Grid Layout of Calendar */}
          <div className="space-y-4">
            {/* Week Headers */}
            <div className="grid grid-cols-7 text-center font-bold text-xs text-slate-400 uppercase tracking-widest pb-2 border-b border-slate-100">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            {/* Monthly numbers */}
            <div className="grid grid-cols-7 gap-y-3.5 gap-x-2 text-center text-xs font-semibold text-slate-600">
              {calendarCells.map((day, index) => {
                if (day === null) {
                  return <div key={`empty-${index}`} className="aspect-square"></div>;
                }

                const dateStr = formatDayString(day);
                const isSelected = selectedDayStr === dateStr;
                const dayEvents = getEventsForDay(day);
                const hasEvents = dayEvents.length > 0;

                // Highlight today (May 30, 2026 is today in default timeline)
                const isToday = dateStr === '2026-05-30';

                return (
                  <button
                    key={`day-${day}`}
                    id={`cal-day-cell-${day}`}
                    onClick={() => handleDaySelect(day)}
                    className={`aspect-square rounded-xl p-1.5 relative flex flex-col justify-between hover:bg-slate-100 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1e40af] text-white hover:bg-blue-800 shadow-sm font-extrabold'
                        : isToday
                        ? 'bg-slate-100 text-[#1e40af] border border-blue-300 font-extrabold'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{day}</span>
                    
                    {/* Events Mini Dots indicators */}
                    {hasEvents && (
                      <div className="flex gap-1 justify-center w-full mt-1 shrink-0">
                        {dayEvents.slice(0, 3).map((evt) => (
                          <span
                            key={evt.id}
                            className={`w-1.5 h-1.5 rounded-full ${
                              evt.type === 'meeting' ? 'bg-indigo-600' :
                              evt.type === 'training' ? 'bg-purple-600' : 'bg-amber-500'
                            } ${isSelected ? 'bg-white' : ''}`}
                          ></span>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick instructions legend */}
          <div className="pt-4 border-t border-slate-150 flex flex-wrap gap-5 text-[10px] text-slate-500 font-bold justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
              <span>Administrative Meetings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600"></span>
              <span>Capacity Trainings</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Barangay / LGU Events</span>
            </div>
          </div>
        </div>

        {/* Right Column: Schedule / Event Creation (Takes 5/12 columns) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Day's Agenda Card */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] text-[#1e40af] uppercase font-mono font-bold tracking-widest">{selectedDayStr} Details</span>
              <h3 className="font-extrabold text-slate-800 text-sm mt-0.5">Focus Agenda</h3>
            </div>

            <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
              {selectedDayEvents.length === 0 ? (
                <div className="p-8 text-center text-slate-400 font-bold text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
                  No official agendas scheduled for this calendar date.
                </div>
              ) : (
                selectedDayEvents.map((evt) => (
                  <div key={evt.id} className="p-4 bg-slate-50 border border-slate-150 rounded-xl space-y-3">
                    <div className="flex gap-2.5 items-start justify-between">
                      <h4 className="font-extrabold text-xs text-slate-800 leading-tight flex-1">{evt.title}</h4>
                      <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${
                        evt.type === 'meeting' ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' :
                        evt.type === 'training' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
                      }`}>
                        {evt.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-650 leading-normal font-sans font-medium">{evt.description}</p>
                    {evt.location && (
                      <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-bold font-sans">
                        <MapPin className="w-3 h-3 text-rose-600 shrink-0" />
                        <span>{evt.location}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schedule Form */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl">
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-xs text-slate-705 uppercase tracking-wider">Book Official Event Context</h4>
                <p className="text-[10px] text-slate-505 mt-0.5">Inject dynamic items into the highlighted day ({selectedDayStr}).</p>
              </div>

              {/* Title Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-505 block uppercase">Agenda Subject</label>
                <input
                  id="input-cal-title"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Barangay Lupon Tagapamayapa Evaluation"
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold"
                />
              </div>

              {/* Grid 2x2 Form Section */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 block uppercase">Timing</label>
                  <input
                    id="input-cal-time"
                    type="text"
                    required
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    placeholder="e.g. 02:00 PM"
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-550 block uppercase">Category</label>
                  <select
                    id="select-cal-cat"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-2.5 focus:outline-none font-semibold focus:border-[#1e40af]"
                  >
                    <option value="meeting" className="bg-white text-slate-800 font-semibold">Meeting</option>
                    <option value="training" className="bg-white text-slate-800 font-semibold">Training</option>
                    <option value="event" className="bg-white text-slate-800 font-semibold">LGU Event</option>
                  </select>
                </div>
              </div>

              {/* Location Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 block uppercase">Location Address</label>
                <input
                  id="input-cal-loc"
                  type="text"
                  value={newLoc}
                  onChange={(e) => setNewLoc(e.target.value)}
                  placeholder="e.g. Barangay Hall Hallway"
                  className="w-full text-xs font-semibold rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold"
                />
              </div>

              {/* Description Input */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-550 block uppercase">Brief Summary</label>
                <textarea
                  id="textarea-cal-desc"
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="Agenda tasks, indicators targeted or attendees requested..."
                  className="w-full text-xs font-medium rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold leading-normal"
                />
              </div>

              {formSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-2 text-[10px] rounded font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Integrated event added to calendar!</span>
                </div>
              )}

              <button
                id="btn-calendar-add"
                type="submit"
                className="w-full py-3 bg-[#1e40af] hover:bg-blue-800 transition-all text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm animate-none font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>Schedule On Calendar</span>
              </button>
            </form>
          </div>

        </div>

      </div>

    </div>
  );
}
