/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { getManilaDateString } from '../../shared/localDate';
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

// An event's category: its name, and the color of its dot.
const CATEGORIES = {
  meeting: { label: 'Meeting', dot: 'bg-indigo-600', chip: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  training: { label: 'Training', dot: 'bg-purple-600', chip: 'bg-purple-50 text-purple-700 border-purple-100' },
  event: { label: 'LGU Event', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 border-amber-100' }
};
const categoryOf = event => CATEGORIES[event?.type] || CATEGORIES.event;

// "09:00 AM" as minutes after midnight, to list a day's events in order (an event with no time
// that reads as one comes last).
const minutesOf = time => {
  const match = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(String(time || '').trim());
  if (!match) return 24 * 60;
  return ((Number(match[1]) % 12) + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + Number(match[2]);
};
// "09:00 AM" as "9:00 AM".
const shortTime = time => String(time || '').trim().replace(/^0(\d)/, '$1');
// "09:00 AM" as "9am" and "01:30 PM" as "1:30pm", to fit a day's box; other text stays as typed.
const compactTime = time => {
  const match = /^0?(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(String(time || '').trim());
  return match ? `${match[1]}${match[2] === '00' ? '' : `:${match[2]}`}${match[3].toLowerCase()}m` : String(time || '').trim();
};
// "2026-11-26" as "Thursday, November 26, 2026".
const longDate = date => new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

// `holidays`: the national holidays WorkMate adds and HR's local ones, each { date, name, kind },
// shown on their days for everyone.
export default function CalendarView({ events, holidays = [], onAddEvent }) {
  const evtList = events && events.length ? events : [];
  const holidayOn = date => holidays.find(holiday => holiday.date === date) || null;
  // Opens on today's month with today selected (Philippine time).
  const today = getManilaDateString(); // YYYY-MM-DD
  const [currentYear, setCurrentYear] = useState(() => Number(today.slice(0, 4)));
  const [currentMonth, setCurrentMonth] = useState(() => Number(today.slice(5, 7)) - 1); // 0-based
  const [selectedDayStr, setSelectedDayStr] = useState(today);
  
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

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      await onAddEvent({
        title: newTitle,
        date: selectedDayStr,
        time: newTime,
        type: newType,
        description: newDesc,
        location: newLoc
      });
    } catch (error) {
      window.alert(`Unable to add the event: ${error.message}`);
      return;
    }

    setNewTitle('');
    setNewDesc('');
    setNewLoc('Provincial Capitol office');
    setFormSuccess(true);
    setTimeout(() => {
      setFormSuccess(false);
    }, 3050);
  };

  // A day's events, earliest first.
  const byTime = (a, b) => minutesOf(a.time) - minutesOf(b.time);
  const selectedDayEvents = evtList.filter(evt => evt.date === selectedDayStr).sort(byTime);
  const selectedHoliday = holidayOn(selectedDayStr);
  const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-`;
  const monthHolidays = holidays.filter(holiday => holiday.date.startsWith(monthPrefix));

  // Helper to find if a day has events
  const getEventsForDay = (day) => {
    if (!day) return [];
    const dateStr = formatDayString(day);
    return evtList.filter(evt => evt.date === dateStr).sort(byTime);
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

                const isToday = dateStr === today;
                const holiday = holidayOn(dateStr);
                // On a wide screen a day lists its first events by name (one when it is a holiday).
                const named = dayEvents.slice(0, holiday ? 1 : 2);

                return (
                  <button
                    key={`day-${day}`}
                    id={`cal-day-cell-${day}`}
                    onClick={() => handleDaySelect(day)}
                    title={holiday ? holiday.name : undefined}
                    aria-label={[String(day), holiday?.name, hasEvents && `${dayEvents.length} event${dayEvents.length === 1 ? '' : 's'}`].filter(Boolean).join(', ')}
                    className={`aspect-square min-w-0 overflow-hidden rounded-xl p-1.5 relative flex flex-col justify-between sm:justify-start sm:gap-0.5 sm:text-left hover:bg-slate-100 transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#1e40af] text-white hover:bg-blue-800 shadow-sm font-extrabold'
                        : isToday
                        ? 'bg-slate-100 text-[#1e40af] border border-blue-300 font-extrabold'
                        : holiday
                        ? 'bg-rose-50 text-rose-700 font-extrabold hover:bg-rose-100'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span>{day}</span>
                    {/* On a phone: a mark for a holiday and a dot for each event. */}
                    {holiday && <span aria-hidden="true" className={`mx-auto h-1 w-4 rounded-full sm:hidden ${isSelected ? 'bg-white' : 'bg-rose-500'}`}></span>}
                    {hasEvents && (
                      <div aria-hidden="true" className="flex gap-1 justify-center w-full mt-1 shrink-0 sm:hidden">
                        {dayEvents.slice(0, 3).map((evt) => (
                          <span key={evt.id} className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : categoryOf(evt).dot}`}></span>
                        ))}
                      </div>
                    )}
                    {/* On a wide screen: the holiday's name and the first events' time and title. */}
                    {holiday && (
                      <span aria-hidden="true" className={`hidden truncate text-[10px] font-bold leading-tight sm:block ${isSelected ? 'text-white' : 'text-rose-700'}`}>{holiday.name}</span>
                    )}
                    {named.map(evt => (
                      <span key={evt.id} aria-hidden="true" className={`hidden min-w-0 items-center gap-1 text-[10px] font-semibold leading-tight sm:flex ${isSelected ? 'text-white' : 'text-slate-700'}`}>
                        <i className={`h-1.5 w-1.5 shrink-0 rounded-full ${isSelected ? 'bg-white' : categoryOf(evt).dot}`} />
                        <span className="truncate">{[compactTime(evt.time), evt.title].filter(Boolean).join(' ')}</span>
                      </span>
                    ))}
                    {dayEvents.length > named.length && (
                      <span aria-hidden="true" className={`hidden text-[10px] font-bold leading-tight sm:block ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>+{dayEvents.length - named.length} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The month's holidays */}
          {monthHolidays.length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-rose-100 bg-rose-50/60 p-3">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-rose-700">Holidays in {monthNames[currentMonth]}</p>
              {monthHolidays.map(holiday => (
                <p key={holiday.date} className="text-xs font-semibold text-slate-700">
                  <b className="text-rose-700">{monthNames[currentMonth].slice(0, 3)} {Number(holiday.date.slice(8, 10))}</b> · {holiday.name}
                  {holiday.kind && <span className="text-slate-500"> · {holiday.kind}</span>}
                </p>
              ))}
            </div>
          )}

          {/* Quick instructions legend */}
          <div className="pt-4 border-t border-slate-150 flex flex-wrap gap-5 text-[10px] text-slate-500 font-bold justify-center">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span>Holiday</span>
            </div>
            {Object.entries(CATEGORIES).map(([key, category]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${category.dot}`}></span>
                <span>{category.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Schedule / Event Creation (Takes 5/12 columns) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Day's Agenda Card */}
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="font-extrabold text-slate-800 text-sm">{longDate(selectedDayStr)}</h3>
              {selectedDayStr === today && <span className="mt-1 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black text-[#1e40af]">Today</span>}
            </div>

            <div className="space-y-4 max-h-56 overflow-y-auto pr-1">
              {selectedHoliday && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
                  <h4 className="text-xs font-extrabold leading-tight text-rose-800">{selectedHoliday.name}</h4>
                  <p className="mt-1 text-[11px] font-semibold text-rose-700">{selectedHoliday.kind || 'Holiday'}. {selectedHoliday.place ? `No work in the offices in ${selectedHoliday.place}, and not counted as a leave day there.` : 'No work, and not counted as a leave day.'}</p>
                </div>
              )}
              {selectedDayEvents.length === 0 && selectedHoliday ? null : selectedDayEvents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-bold text-xs border border-dashed border-slate-200 rounded-xl bg-slate-50">
                  No events on this day.
                </div>
              ) : (
                selectedDayEvents.map((evt) => (
                  <div key={evt.id} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex gap-2.5 items-start justify-between">
                      <h4 className="font-extrabold text-xs text-slate-800 leading-tight flex-1">{evt.title}</h4>
                      <span className={`shrink-0 border text-[9px] font-extrabold uppercase px-2 py-0.5 rounded ${categoryOf(evt).chip}`}>
                        {categoryOf(evt).label}
                      </span>
                    </div>
                    {/* When and where. */}
                    {(evt.time || evt.location) && (
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold text-slate-600">
                        {evt.time && <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3 shrink-0 text-[#1e40af]" />{shortTime(evt.time)}</span>}
                        {evt.location && <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0 text-rose-600" />{evt.location}</span>}
                      </div>
                    )}
                    {evt.description && <p className="text-[11px] text-slate-600 leading-normal font-medium">{evt.description}</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Schedule Form: only accounts that can create events (HR) get onAddEvent. */}
          {onAddEvent ? (
          <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl">
            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="font-extrabold text-sm text-slate-800">Add an event</h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">On {longDate(selectedDayStr)}. Pick another day on the calendar to add it there.</p>
              </div>

              {/* Title Input */}
              <div className="space-y-1">
                <label htmlFor="input-cal-title" className="text-[10px] font-bold text-slate-500 block uppercase">Title</label>
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
                  <label htmlFor="input-cal-time" className="text-[10px] font-bold text-slate-500 block uppercase">Time</label>
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
                  <label htmlFor="select-cal-cat" className="text-[10px] font-bold text-slate-500 block uppercase">Category</label>
                  <select
                    id="select-cal-cat"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-800 p-2.5 focus:outline-none font-semibold focus:border-[#1e40af]"
                  >
                    {Object.entries(CATEGORIES).map(([key, category]) => (
                      <option key={key} value={key} className="bg-white text-slate-800 font-semibold">{category.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Location Input */}
              <div className="space-y-1">
                <label htmlFor="input-cal-loc" className="text-[10px] font-bold text-slate-500 block uppercase">Location</label>
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
                <label htmlFor="textarea-cal-desc" className="text-[10px] font-bold text-slate-500 block uppercase">Details</label>
                <textarea
                  id="textarea-cal-desc"
                  required
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  rows={2}
                  placeholder="What it is about and who should attend"
                  className="w-full text-xs font-medium rounded-lg border border-slate-200 p-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500/10 focus:border-[#1e40af] bg-slate-50 text-slate-800 placeholder:text-slate-400 font-semibold leading-normal"
                />
              </div>

              {formSuccess && (
                <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 p-2 text-[10px] rounded font-bold flex items-center gap-1">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Event added to the calendar.</span>
                </div>
              )}

              <button
                id="btn-calendar-add"
                type="submit"
                className="w-full py-3 bg-[#1e40af] hover:bg-blue-800 transition-all text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-sm animate-none font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>Add to Calendar</span>
              </button>
            </form>
          </div>
          ) : (
            <div className="bg-white border border-slate-200 p-6 shadow-sm rounded-2xl text-[11px] font-semibold text-slate-500">
              Official events are scheduled by the HR Administrator. Contact HR to add an event to the calendar.
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
