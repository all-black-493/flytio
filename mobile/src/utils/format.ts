/** Formats an ISO-8601 duration like "PT20H20M" as "20h 20m". */
export function formatDuration(isoDuration: string | null): string {
  if (!isoDuration) return '';
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?$/.exec(isoDuration);
  if (!match) return isoDuration;
  const [, hours, minutes] = match;
  return [hours && `${hours}h`, minutes && `${minutes}m`].filter(Boolean).join(' ');
}

/** Formats an ISO datetime as "12:30". */
export function formatTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Formats an ISO datetime as "28 Aug". */
export function formatShortDate(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** Formats a decimal-string amount + currency as "$1,270". */
export function formatPrice(amount: string, currency: string): string {
  const value = Number(amount);
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}
