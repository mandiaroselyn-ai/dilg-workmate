import { useEffect, useState } from 'react';
import { getManilaDateString, msUntilManilaMidnight } from '../../shared/localDate';

// Today's date in Manila (YYYY-MM-DD) for a screen that shows something about today, such as the
// status dot on the employee's picture. It changes just after midnight, and is read again whenever
// the app comes back on screen (a phone woken up, or the tab opened again), since a phone can pause
// timers while the app is in the background. The screen redraws only when the date has changed.
export default function useManilaToday() {
  const [today, setToday] = useState(getManilaDateString);
  useEffect(() => {
    let timer;
    const check = () => setToday(getManilaDateString());
    const scheduleMidnight = () => {
      window.clearTimeout(timer);
      // A second past midnight, so the new day has begun.
      timer = window.setTimeout(() => {
        check();
        scheduleMidnight();
      }, msUntilManilaMidnight() + 1000);
    };
    const onBack = () => {
      if (document.hidden) return;
      check();
      scheduleMidnight();
    };
    scheduleMidnight();
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, []);
  return today;
}
