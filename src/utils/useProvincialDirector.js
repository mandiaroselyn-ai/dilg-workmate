import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import { provincialDirectorName } from './consolidatedAttendance.js';

// The Provincial Director's name for the Consolidated Report of Attendance, for HR: from the
// supervisor and HR/Admin accounts (loaded once) and the employee accounts (`employees`), or ''
// when no active account has that position title (see provincialDirectorName).
export const useProvincialDirector = (employees = []) => {
  const [staff, setStaff] = useState([]);
  useEffect(() => {
    let current = true;
    apiFetch('/api/staff')
      .then(response => (response.ok ? response.json() : null))
      .then(data => { if (current && Array.isArray(data?.staff)) setStaff(data.staff); })
      .catch(() => {});
    return () => { current = false; };
  }, []);
  return provincialDirectorName([...staff, ...employees]);
};
