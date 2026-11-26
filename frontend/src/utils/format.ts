export function formatDateTime(value?: string | Date | null, timeZone?: string): string {
  if (!value) return 'Never';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'medium',
      ...(timeZone ? { timeZone } : {}),
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatShortTime(value?: string | Date | null): string {
  if (!value) return '--';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatRelativeTime(value?: string | Date | null): string {
  if (!value) return 'No data yet';
  const date = typeof value === 'string' ? new Date(value) : value;
  const diffSec = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

export function formatDurationSeconds(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function formatEventLabel(eventType: string): string {
  return eventType.replace(/_/g, ' ');
}

export function formatAuthMethod(method?: string | null): string {
  if (!method) return 'System';
  switch (method) {
    case 'KEYPAD':
      return '4x4 Keypad';
    case 'FACE_RECOGNITION':
      return 'Face Recognition';
    case 'REMOTE_WEB':
      return 'Remote Dashboard';
    case 'AUTO_LOCK':
      return 'Auto-Lock Timer';
    case 'ULTRASONIC':
      return 'Ultrasonic Sensor';
    default:
      return method;
  }
}
