// All instants are stored in UTC. Ghana-local calendar values are derived with Intl (Africa/Accra).
const TZ = 'Africa/Accra';
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
function localParts(d = new Date()) {
  const p = {};
  for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), dow: DOW[p.weekday] };
}
function dowOfDate(dateStr) {
  const n = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return n === 0 ? 7 : n;
}
const toMinutes = (t) => { const [h, m] = String(t).split(':'); return Number(h) * 60 + Number(m); };
module.exports = { TZ, localParts, dowOfDate, toMinutes };
