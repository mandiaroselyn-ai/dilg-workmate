import { useEffect, useState } from 'react';
import { apiFetch } from './api';

// The month WorkMate starts counting leave credits, and the leave card date it starts from
// (shared/leaveStart.js), as the server has them: [{ start, asOf }, setCreditsStart].
export default function useLeaveCreditsStart() {
  const [creditsStart, setCreditsStart] = useState({ start: '', asOf: '' });
  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/employees/leave-credits-start')
      .then(response => response.json())
      .then(data => { if (!cancelled && data?.success) setCreditsStart({ start: data.start || '', asOf: data.asOf || '' }); })
      .catch(error => console.error('Unable to load the leave credits start:', error));
    return () => { cancelled = true; };
  }, []);
  return [creditsStart, setCreditsStart];
}
