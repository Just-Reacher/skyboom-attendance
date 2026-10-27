/* Shared helpers: API client, formatting, toasts, modal dialogs. No inline scripts (CSP). */
const TZ = 'Africa/Accra';
let csrfToken = null;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);
const fmtTime = (i) => (i ? new Date(i).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }) : '-');
const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + 'T12:00:00Z' : d).toLocaleDateString('en-GB', { timeZone: TZ, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const fmtDateTime = (i) => (i ? `${fmtDate(i)} ${fmtTime(i)}` : '-');
const todayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
// Ghana (Africa/Accra) is UTC+0 all year, so a datetime-local value can be treated as UTC.
const inputToIso = (v) => (v ? new Date(v + ':00Z').toISOString() : undefined);
const isoToInput = (i) => (i ? new Date(i).toISOString().slice(0, 16) : '');
const LABELS = { on_time: 'On time', late: 'Late', incomplete: 'Incomplete', in_progress: 'In progress', completed: 'Completed', absent: 'Absent', active: 'Active', inactive: 'Inactive', pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };
const badge = (k) => `<span class="badge ${esc(k)}">${esc(LABELS[k] || k)}</span>`;

async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (method !== 'GET') {
    if (!csrfToken) csrfToken = (await (await fetch('/api/auth/csrf', { credentials: 'same-origin' })).json()).data.token;
    opt.headers['X-CSRF-Token'] = csrfToken;
  }
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api' + path, opt); } catch { throw new Error('Cannot reach the server. Check your internet connection and try again.'); }
  let json = null; try { json = await res.json(); } catch { /* not json */ }
  if (res.status === 401 && !path.startsWith('/auth/login')) { location.href = '/login'; throw new Error('Please log in.'); }
  if (!res.ok) {
    if (json?.error?.code === 'CSRF_INVALID') csrfToken = null;
    const e = new Error(json?.error?.message || 'Request failed.'); e.code = json?.error?.code; e.status = res.status; throw e;
  }
  return json; // {success,data,meta}
}
const get = async (p) => (await api(p)).data;
const qs = (o) => { const p = new URLSearchParams(); Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v); }); const s = p.toString(); return s ? '?' + s : ''; };

function toast(msg, type = 'ok') {
  const box = $('#toasts'); if (!box) return alert(msg);
  const t = document.createElement('div'); t.className = 'toast ' + (type === 'error' ? 'error' : ''); t.textContent = msg; box.append(t);
  setTimeout(() => t.remove(), 5000);
}

// Generic modal form. fields: [{name,label,type,value,required,options,hint,min,max,step}]
function modalForm({ title, intro, fields, submitLabel = 'Save', danger = false, onSubmit }) {
  const dlg = document.createElement('dialog');
  const inputs = fields.map((f) => {
    const id = 'f_' + f.name, req = f.required ? 'required' : '';
    let el;
    if (f.type === 'select') el = `<select id="${id}" ${req}>${f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(f.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') el = `<textarea id="${id}" ${req} maxlength="500">${esc(f.value || '')}</textarea>`;
    else if (f.type === 'checkbox') return `<div class="field"><label><input id="${id}" type="checkbox" ${f.value ? 'checked' : ''}> ${esc(f.label)}</label>${f.hint ? `<div class="muted">${esc(f.hint)}</div>` : ''}</div>`;
    else if (f.type === 'days') el = `<div class="days" id="${id}">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => `<label><input type="checkbox" value="${i + 1}" ${(f.value || []).includes(i + 1) ? 'checked' : ''}> ${d}</label>`).join('')}</div>`;
    else el = `<input id="${id}" type="${f.type || 'text'}" value="${esc(f.value ?? '')}" ${req} ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.step ? `step="${f.step}"` : ''} autocomplete="off">`;
    return `<div class="field"><label for="${id}">${esc(f.label)}</label>${el}${f.hint ? `<div class="muted">${esc(f.hint)}</div>` : ''}</div>`;
  }).join('');
  dlg.innerHTML = `<form method="dialog" novalidate><h2>${esc(title)}</h2>${intro ? `<p class="muted">${esc(intro)}</p>` : ''}${inputs}<div class="err" role="alert"></div>
    <div class="row"><button class="${danger ? 'danger' : 'primary'}" type="submit">${esc(submitLabel)}</button><button type="button" data-cancel>Cancel</button></div></form>`;
  document.body.append(dlg); dlg.showModal();
  dlg.addEventListener('close', () => dlg.remove());
  $('[data-cancel]', dlg).onclick = () => dlg.close();
  $('form', dlg).onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target, err = $('.err', dlg), btn = $('button[type=submit]', dlg);
    const v = {};
    for (const f of fields) {
      const el = $('#f_' + f.name, dlg);
      if (f.type === 'checkbox') v[f.name] = el.checked;
      else if (f.type === 'days') v[f.name] = [...el.querySelectorAll('input:checked')].map((x) => Number(x.value));
      else v[f.name] = el.value;
      if (f.required && f.type !== 'days' && f.type !== 'checkbox' && !String(v[f.name]).trim()) { err.textContent = `${f.label} is required.`; return; }
    }
    btn.disabled = true; err.textContent = '';
    try { await onSubmit(v); dlg.close(); } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  };
  return dlg;
}

function confirmDialog({ title, message, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    let done = false;
    const d = modalForm({ title, intro: message, fields: [], submitLabel: confirmLabel, danger, onSubmit: async () => { done = true; resolve(true); } });
    d.addEventListener('close', () => { if (!done) resolve(false); });
  });
}

function table(cols, rows, empty = 'Nothing to show yet.') {
  if (!rows.length) return `<div class="empty">${esc(empty)}</div>`;
  return `<div class="tablewrap"><table><thead><tr>${cols.map((c) => `<th scope="col">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r) => `<tr>${cols.map((c) => `<td>${c.html ? c.html(r) : esc(c.v(r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function setupShell(user, links) {
  $('#nav').innerHTML = links.map(([h, t]) => `<a href="#${h}" data-r="${h}">${esc(t)}</a>`).join('');
  $('#who').innerHTML = `<b>${esc(user.full_name)}</b><br><span class="muted">${esc(user.role === 'admin' ? 'Administrator' : 'Staff')}</span>`;
  $('#logout').onclick = async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { location.href = '/login'; } };
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $('#nav').onclick = () => $('#side').classList.remove('open');
}
function startRouter(routes, fallback) {
  const go = async () => {
    const r = location.hash.slice(1) || fallback;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.r === r));
    const main = $('#main'); main.innerHTML = '<div class="loading">Loading...</div>';
    try { await (routes[r] || routes[fallback])(main); } catch (e) { main.innerHTML = `<div class="notice" role="alert">${esc(e.message)}</div>`; }
  };
  window.addEventListener('hashchange', go); go();
}
function pager(el, meta, page, onPage) {
  const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
  el.innerHTML = `<span class="muted">${meta.total} record${meta.total === 1 ? '' : 's'} - page ${page} of ${pages}</span>
    <button class="small" ${page <= 1 ? 'disabled' : ''} data-p="-1">Previous</button><button class="small" ${page >= pages ? 'disabled' : ''} data-p="1">Next</button>`;
  el.querySelectorAll('button').forEach((b) => (b.onclick = () => onPage(page + Number(b.dataset.p))));
}
