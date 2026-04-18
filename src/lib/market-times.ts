
export interface MarketSession {
  name: string;
  start: number; // Hour in UTC
  end: number;   // Hour in UTC
  color: string;
  isKillzone: boolean;
}

export const SESSIONS: MarketSession[] = [
  { name: 'Asian Session', start: 0, end: 6, color: '#3B82F6', isKillzone: false },
  { name: 'London Open', start: 7, end: 10, color: '#F27D26', isKillzone: true },
  { name: 'New York Open', start: 12, end: 15, color: '#F27D26', isKillzone: true },
  { name: 'London Close', start: 15, end: 17, color: '#F27D26', isKillzone: true },
];

export function getCurrentSession(): MarketSession | null {
  const now = new Date();
  const utcHour = now.getUTCHours();
  
  // Find matching session
  return SESSIONS.find(s => {
    if (s.start < s.end) {
      return utcHour >= s.start && utcHour < s.end;
    } else {
      // Handles sessions crossing midnight (if any)
      return utcHour >= s.start || utcHour < s.end;
    }
  }) || null;
}

export function getSessionStatus() {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  
  const current = getCurrentSession();
  
  let nextSession = null;
  let timeToNext = '';

  const sortedSessions = [...SESSIONS].sort((a, b) => a.start - b.start);
  nextSession = sortedSessions.find(s => s.start > utcHour) || sortedSessions[0];

  if (nextSession) {
    let diffHours = nextSession.start - utcHour;
    if (diffHours <= 0) diffHours += 24;
    
    let totalMinutes = (diffHours * 60) - utcMinutes;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    timeToNext = `${h}h ${m}m`;
  }

  return {
    current,
    nextSession,
    timeToNext,
    utcTime: `${utcHour.toString().padStart(2, '0')}:${utcMinutes.toString().padStart(2, '0')} UTC`
  };
}
