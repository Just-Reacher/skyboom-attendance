const attendance = require('../repositories/attendance');
const PDFDocument = require('pdfkit');
const { TZ } = require('../utils/time');
const { AppError } = require('../utils/errors');

const t = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '');
const LABEL = { on_time: 'On time', late: 'Late', absent: 'Absent' };
const REC = { completed: 'Completed', incomplete: 'Incomplete', in_progress: 'In progress', '': '' };

async function build({ from, to, userId, status, department }) {
  if (from > to) throw new AppError(400, 'BAD_RANGE', 'The start date must not be after the end date.');
  if ((new Date(to) - new Date(from)) / 864e5 > 366) throw new AppError(400, 'BAD_RANGE', 'Date range is limited to 366 days.');
  const f = { from, to, userId, department };
  let rows = [];
  if (status !== 'absent') rows = (await attendance.all({ ...f, status })).map((r) => ({
    date: r.work_date, staff_no: r.staff_no, name: r.full_name, department: r.department || '', check_in: t(r.check_in_at), check_out: t(r.check_out_at),
    status: LABEL[r.status], record: REC[r.state], early: r.early_departure ? 'Yes' : 'No', source: r.source, _s: r.status, _state: r.state, _e: r.early_departure }));
  if (!status || status === 'absent') {
    const abs = await attendance.absences(f);
    rows.push(...abs.map((r) => ({ date: r.work_date, staff_no: r.staff_no, name: r.full_name, department: r.department || '', check_in: '', check_out: '',
      status: 'Absent', record: '', early: '', source: '', _s: 'absent' })));
  }
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name)));
  const totals = { records: rows.length, present: rows.filter((r) => r._s !== 'absent').length, on_time: rows.filter((r) => r._s === 'on_time').length,
    late: rows.filter((r) => r._s === 'late').length, absent: rows.filter((r) => r._s === 'absent').length,
    incomplete: rows.filter((r) => r._state === 'incomplete').length, early_departures: rows.filter((r) => r._e).length };
  return { from, to, totals, rows: rows.map(({ _s, _state, _e, ...r }) => r) };
}

const HEAD = ['Date', 'Staff No', 'Name', 'Department', 'Check-in', 'Check-out', 'Status', 'Record', 'Early departure', 'Source'];
const cells = (r) => [r.date, r.staff_no, r.name, r.department, r.check_in, r.check_out, r.status, r.record, r.early, r.source];
const csvCell = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };

function toCsv(rep) {
  const L = [`Skyboom Ghana Limited - Attendance Report`, `Period,${rep.from} to ${rep.to}`,
    `Totals,Records ${rep.totals.records},On time ${rep.totals.on_time},Late ${rep.totals.late},Absent ${rep.totals.absent},Incomplete ${rep.totals.incomplete},Early departures ${rep.totals.early_departures}`, '',
    HEAD.map(csvCell).join(','), ...rep.rows.map((r) => cells(r).map(csvCell).join(','))];
  return '\uFEFF' + L.join('\r\n'); // BOM so Excel opens UTF-8 correctly
}

function toPdf(rep, res) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  doc.pipe(res);
  const NAVY = '#0B1F3A', SALMON = '#FA8072';
  const widths = [62, 56, 120, 90, 52, 55, 55, 65, 70, 55];
  const header = () => {
    doc.fillColor(NAVY).fontSize(15).text('Skyboom Ghana Limited - Attendance Report', 36, 36);
    doc.fontSize(9).fillColor('#333').text(`Period: ${rep.from} to ${rep.to}   |   Times: Africa/Accra`, 36, 56);
    const x = rep.totals;
    doc.text(`Records ${x.records}  |  On time ${x.on_time}  |  Late ${x.late}  |  Absent ${x.absent}  |  Incomplete ${x.incomplete}  |  Early departures ${x.early_departures}`, 36, 69);
    doc.rect(36, 86, 780, 2).fill(SALMON);
  };
  const row = (vals, y, bold) => {
    let x = 36; doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(NAVY);
    vals.forEach((v, i) => { doc.text(String(v ?? ''), x, y, { width: widths[i] - 4, height: 11, ellipsis: true, lineBreak: false }); x += widths[i]; });
  };
  header(); let y = 96; row(HEAD, y, true); y += 16;
  for (const r of rep.rows) {
    if (y > 540) { doc.addPage(); header(); y = 96; row(HEAD, y, true); y += 16; }
    row(cells(r), y, false); y += 13;
  }
  if (!rep.rows.length) doc.fontSize(10).fillColor('#333').text('No records match these filters.', 36, y);
  doc.end();
}
module.exports = { build, toCsv, toPdf };
