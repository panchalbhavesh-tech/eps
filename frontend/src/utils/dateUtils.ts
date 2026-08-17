/**
 * Parses a backend UTC timestamp into a correct Date object.
 * If the timestamp is a string without timezone info (e.g., 'YYYY-MM-DDTHH:MM:SS'),
 * it appends 'Z' to force UTC parsing instead of local parsing.
 */
export const parseBackendTimestamp = (timestamp: string | number): Date => {
  let val = timestamp;
  if (typeof val === 'string' && val.includes('T') && !val.endsWith('Z') && !val.includes('+') && !val.match(/-\d{2}:\d{2}$/)) {
    // If it's a naive ISO string like "2026-08-17T10:47:50", treat it as UTC
    val = val + 'Z';
  }
  return new Date(Number(val) || val);
};

/**
 * Formats a backend timestamp directly to Indian Standard Time (IST) strings.
 * Ensures the date is parsed as UTC first.
 */
export const formatToIST = (timestamp: string | number) => {
  const date = parseBackendTimestamp(timestamp);

  const dateStr = new Intl.DateTimeFormat('en-GB', { 
    timeZone: 'Asia/Kolkata', 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  }).format(date);
  
  const timeStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Asia/Kolkata', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: true 
  }).format(date);

  // Ensure 2-digit hour format (e.g. 04:56:06 PM instead of 4:56:06 PM)
  let formattedTimeStr = timeStr;
  const parts = formattedTimeStr.split(':');
  if (parts[0].length === 1) {
    formattedTimeStr = '0' + formattedTimeStr;
  }

  return {
    date,
    dateStr,
    timeStr: formattedTimeStr,
    fullStr: `${dateStr} · ${formattedTimeStr}`
  };
};
