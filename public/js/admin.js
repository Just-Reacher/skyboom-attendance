(async () => {
  const { user } = await get('/auth/me');
  setupShell(user, [['dashboard', 'Dashboard'], ['staff', 'Staff'], ['attendance', 'Attendance'], ['exceptions', 'Exceptions'], ['schedules', 'Work schedule'],
    ['office', 'Office location'], ['reports', 'Reports'], ['audit', 'Audit logs'], ['account', 'My account']]);
  if (user.must_change_password) location.hash = 'account';

  // ---- UI only: sidebar icons + collapsible sidebar (no effect on data or permissions) ----
  const svg = (p) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    dashboard: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
    staff: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.4c2 .8 3.5 2.6 3.5 5.6"/>',
    attendance: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18M9 15l2 2 4-4"/>',
    exceptions: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
    schedules: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    office: '<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    reports: '<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3"/>',
    audit: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    account: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>',
    logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h11"/>',
  };
  document.querySelectorAll('#nav a').forEach((a) => {
    const label = a.textContent; a.title = label;
    a.innerHTML = svg(ICONS[a.dataset.r] || ICONS.dashboard) + `<span class="lbl">${esc(label)}</span>`;
  });
  $('#logout').innerHTML = svg(ICONS.logout) + '<span class="lbl">Log out</span>'; $('#logout').title = 'Log out';
  const shellEl = $('.shell'), collapseBtn = $('#collapse'), SIDEBAR_KEY = 'skyboom.sidebar.collapsed';
  const setCollapsed = (c) => {
    shellEl.classList.toggle('collapsed', c);
    collapseBtn.setAttribute('aria-expanded', String(!c));
    collapseBtn.setAttribute('aria-label', c ? 'Expand sidebar' : 'Collapse sidebar'); collapseBtn.title = c ? 'Expand sidebar' : 'Collapse sidebar';
    try { localStorage.setItem(SIDEBAR_KEY, c ? '1' : '0'); } catch { /* storage unavailable */ }
  };
  let wasCollapsed = false; try { wasCollapsed = localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { /* ignore */ }
  setCollapsed(wasCollapsed);
  collapseBtn.onclick = () => setCollapsed(!shellEl.classList.contains('collapsed'));
  const dayName = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const errToast = (e) => toast(e.message, 'error');
  const staffOptions = async (all = true) => (await get('/admin/staff?role=staff')).map((u) => ({ value: u.id, label: `${u.full_name} (${u.staff_no})` })).concat([]).reduce((a, o) => a.concat(o), all ? [{ value: '', label: 'All staff' }] : []);
  const statusOpts = [['', 'All'], ['on_time', 'On time'], ['late', 'Late'], ['absent', 'Absent'], ['incomplete', 'Incomplete'], ['early_departure', 'Early departure']];
  const sel = (id, opts) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;

  const routes = {
    async dashboard(main) {
      let date = todayStr();
      const draw = async () => {
        const o = await get('/admin/overview' + qs({ date }));
        $('#dash').innerHTML = `<div class="grid">
          <div class="stat"><span class="muted">Active staff</span><b>${o.total_active_staff}</b></div>
          <div class="stat"><span class="muted">Checked in</span><b>${o.checked_in}</b></div>
          <div class="stat flag"><span class="muted">Late</span><b>${o.late}</b></div>
          <div class="stat flag"><span class="muted">Absent (after deadline)</span><b>${o.absent}</b></div>
          <div class="stat flag"><span class="muted">Incomplete</span><b>${o.incomplete}</b></div></div>
          ${o.pending_exceptions ? `<div class="notice"><a href="#exceptions">${o.pending_exceptions} exception request${o.pending_exceptions > 1 ? 's' : ''} waiting for review</a></div>` : ''}
          <p class="muted">${o.is_today ? 'Live data for today. Absences appear only after the configured absence deadline.' : 'Historical view for ' + esc(fmtDate(date)) + '.'}</p>
          <div class="card"><h2>Recent activity</h2>${table([{ h: 'Staff', v: (r) => r.full_name }, { h: 'Date', v: (r) => fmtDate(r.work_date) }, { h: 'Check-in', v: (r) => fmtTime(r.check_in_at) }, { h: 'Check-out', v: (r) => fmtTime(r.check_out_at) }, { h: 'Status', html: (r) => badge(r.status) }], o.recent, 'No attendance recorded yet.')}</div>`;
      };
      main.innerHTML = `<div class="row between"><h1>Dashboard</h1><div class="row"><div><label for="dd">Date</label><input type="date" id="dd" value="${date}"></div></div></div><div id="dash"></div>`;
      $('#dd').onchange = (e) => { date = e.target.value || todayStr(); draw().catch(errToast); };
      await draw();
    },

    async staff(main) {
      main.innerHTML = `<div class="row between"><h1>Staff</h1><button class="primary" id="add">Add staff member</button></div>
        <div class="card"><div class="row"><div><label for="q">Search</label><input id="q" placeholder="Name, email or staff no"></div><div><label for="st">Status</label>${sel('st', [['', 'All'], ['active', 'Active'], ['inactive', 'Inactive']])}</div></div><div id="list"></div></div>`;
      const load = async () => {
        const rows = await get('/admin/staff' + qs({ q: $('#q').value.trim(), status: $('#st').value }));
        $('#list').innerHTML = table([{ h: 'Staff no', v: (r) => r.staff_no }, { h: 'Name', v: (r) => r.full_name }, { h: 'Email', v: (r) => r.email }, { h: 'Department', v: (r) => r.department || '' },
          { h: 'Role', v: (r) => (r.role === 'admin' ? 'Administrator' : 'Staff') }, { h: 'Status', html: (r) => badge(r.status) },
          { h: 'Actions', html: (r) => `<button class="small" data-e="${r.id}">Edit</button> <button class="small" data-pw="${r.id}">Reset password</button> ${String(r.id) === String(user.id) ? '' : `<button class="small ${r.status === 'active' ? 'danger' : ''}" data-t="${r.id}">${r.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>`}` }], rows, 'No staff match.');
        const find = (id) => rows.find((r) => String(r.id) === String(id));
        $('#list').querySelectorAll('[data-e]').forEach((b) => (b.onclick = () => edit(find(b.dataset.e))));
        $('#list').querySelectorAll('[data-pw]').forEach((b) => (b.onclick = () => resetPw(find(b.dataset.pw))));
        $('#list').querySelectorAll('[data-t]').forEach((b) => (b.onclick = async () => {
          const u = find(b.dataset.t), to = u.status === 'active' ? 'inactive' : 'active';
          if (!(await confirmDialog({ title: `${to === 'inactive' ? 'Deactivate' : 'Reactivate'} ${u.full_name}?`, message: to === 'inactive' ? 'They will be logged out and unable to sign in. Their attendance history is kept.' : 'They will be able to sign in again.', confirmLabel: to === 'inactive' ? 'Deactivate' : 'Reactivate', danger: to === 'inactive' }))) return;
          try { await api('/admin/staff/' + u.id, { method: 'PATCH', body: { status: to } }); toast('Updated.'); load(); } catch (e) { errToast(e); }
        }));
      };
      const roleOpts = [{ value: 'staff', label: 'Staff' }, { value: 'admin', label: 'Administrator' }];
      const edit = (u) => modalForm({ title: 'Edit ' + u.full_name, fields: [
        { name: 'staff_no', label: 'Staff number', value: u.staff_no, required: true }, { name: 'full_name', label: 'Full name', value: u.full_name, required: true },
        { name: 'email', label: 'Email', type: 'email', value: u.email, required: true }, { name: 'department', label: 'Department', value: u.department || '' },
        ...(String(u.id) === String(user.id) ? [] : [{ name: 'role', label: 'Role', type: 'select', value: u.role, options: roleOpts }])],
        onSubmit: async (v) => { await api('/admin/staff/' + u.id, { method: 'PATCH', body: { ...v, department: v.department.trim() || null } }); toast('Saved.'); load(); } });
      const resetPw = (u) => modalForm({ title: 'Reset password for ' + u.full_name, intro: 'Set a temporary password. They must change it at next login and will be logged out now.',
        fields: [{ name: 'password', label: 'Temporary password', type: 'password', required: true, hint: 'At least 10 characters, letters and a number.' }], submitLabel: 'Reset password',
        onSubmit: async (v) => { await api(`/admin/staff/${u.id}/reset-password`, { method: 'POST', body: v }); toast('Password reset.'); } });
      $('#add').onclick = () => modalForm({ title: 'Add staff member', fields: [
        { name: 'staff_no', label: 'Staff number', required: true }, { name: 'full_name', label: 'Full name', required: true }, { name: 'email', label: 'Email', type: 'email', required: true },
        { name: 'department', label: 'Department' }, { name: 'role', label: 'Role', type: 'select', value: 'staff', options: roleOpts },
        { name: 'password', label: 'Initial password', type: 'password', required: true, hint: 'At least 10 characters, letters and a number. They must change it at first login.' }], submitLabel: 'Create account',
        onSubmit: async (v) => { await api('/admin/staff', { method: 'POST', body: { ...v, department: v.department.trim() || null } }); toast('Account created.'); load(); } });
      $('#q').oninput = (() => { let t; return () => { clearTimeout(t); t = setTimeout(() => load().catch(errToast), 300); }; })();
      $('#st').onchange = () => load().catch(errToast);
      await load();
    },

    async attendance(main) {
      let page = 1; const people = await staffOptions();
      main.innerHTML = `<div class="row between"><h1>Attendance</h1><button class="primary" id="add">Add missing record</button></div><div class="card"><div class="row">
        <div><label for="u">Staff</label>${sel('u', people.map((p) => [p.value, p.label]))}</div><div><label for="f">From</label><input type="date" id="f" value="${todayStr()}"></div>
        <div><label for="t">To</label><input type="date" id="t" value="${todayStr()}"></div><div><label for="s">Status</label>${sel('s', statusOpts)}</div><button class="primary" id="go">Apply</button></div>
        <div id="list"></div><div class="pager" id="pg"></div></div>`;
      const load = async () => {
        $('#list').innerHTML = '<div class="loading">Loading...</div>';
        const r = await api('/admin/attendance' + qs({ user_id: $('#u').value, from: $('#f').value, to: $('#t').value, status: $('#s').value, page }));
        $('#list').innerHTML = table([{ h: 'Date', v: (x) => fmtDate(x.work_date) }, { h: 'Staff', v: (x) => `${x.full_name} (${x.staff_no})` }, { h: 'Check-in', v: (x) => fmtTime(x.check_in_at) }, { h: 'Check-out', v: (x) => fmtTime(x.check_out_at) },
          { h: 'Status', html: (x) => badge(x.status) + (x.early_departure ? ' <span class="badge incomplete">Early</span>' : '') }, { h: 'Record', html: (x) => (x.state === 'absent' ? '' : badge(x.state)) },
          { h: 'Source', v: (x) => x.source || '' }, { h: '', html: (x) => (x.id ? `<button class="small" data-c="${x.id}">Correct</button>` : `<button class="small" data-a="${x.user_id}|${x.work_date}">Add record</button>`) }], r.data, 'No records match these filters.');
        pager($('#pg'), r.meta, page, (p) => { page = p; load().catch(errToast); });
        $('#list').querySelectorAll('[data-c]').forEach((b) => (b.onclick = () => correct(r.data.find((x) => String(x.id) === String(b.dataset.c)))));
        $('#list').querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { const [uid, d] = b.dataset.a.split('|'); create(uid, d); }));
      };
      const reasonField = { name: 'reason', label: 'Reason (required, recorded in the audit log)', type: 'textarea', required: true };
      const correct = (x) => modalForm({ title: `Correct record - ${x.full_name}, ${fmtDate(x.work_date)}`, intro: 'The original values are kept in the audit log.',
        fields: [{ name: 'check_in_at', label: 'Check-in (Ghana time)', type: 'datetime-local', value: isoToInput(x.check_in_at), required: true },
          { name: 'check_out_at', label: 'Check-out (Ghana time; leave empty for none)', type: 'datetime-local', value: isoToInput(x.check_out_at) }, reasonField], submitLabel: 'Save correction',
        onSubmit: async (v) => { await api('/admin/attendance/' + x.id, { method: 'PATCH', body: { check_in_at: inputToIso(v.check_in_at), check_out_at: v.check_out_at ? inputToIso(v.check_out_at) : null, reason: v.reason } }); toast('Record corrected.'); load(); } });
      const create = (uid, d) => modalForm({ title: 'Add missing attendance record', fields: [
        { name: 'user_id', label: 'Staff member', type: 'select', value: uid || '', options: people.filter((p) => p.value !== '') },
        { name: 'work_date', label: 'Work date', type: 'date', value: d || todayStr(), required: true },
        { name: 'check_in_at', label: 'Check-in (Ghana time)', type: 'datetime-local', required: true }, { name: 'check_out_at', label: 'Check-out (optional)', type: 'datetime-local' }, reasonField], submitLabel: 'Add record',
        onSubmit: async (v) => { await api('/admin/attendance', { method: 'POST', body: { user_id: Number(v.user_id), work_date: v.work_date, check_in_at: inputToIso(v.check_in_at), check_out_at: v.check_out_at ? inputToIso(v.check_out_at) : null, reason: v.reason } }); toast('Record added.'); load(); } });
      $('#add').onclick = () => create();
      $('#go').onclick = () => { page = 1; load().catch(errToast); };
      await load();
    },

    async exceptions(main) {
      main.innerHTML = '<h1>Exception requests</h1><div class="card"><div class="row"><div><label for="s">Show</label>' + sel('s', [['pending', 'Pending'], ['', 'All']]) + '</div></div><div id="list"></div></div>';
      const load = async () => {
        const rows = await get('/admin/exceptions' + qs({ status: $('#s').value }));
        $('#list').innerHTML = table([{ h: 'Requested', v: (x) => fmtDateTime(x.created_at) }, { h: 'Staff', v: (x) => `${x.full_name} (${x.staff_no})` }, { h: 'Work date', v: (x) => fmtDate(x.work_date) }, { h: 'Type', v: (x) => x.type.replace('_', '-') },
          { h: 'Staff reason', v: (x) => x.reason }, { h: 'Status', html: (x) => badge(x.status) }, { h: 'Review note', v: (x) => x.review_note || '' },
          { h: '', html: (x) => (x.status === 'pending' ? `<button class="small" data-r="${x.id}">Review</button>` : '') }], rows, 'No requests.');
        $('#list').querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => review(rows.find((x) => String(x.id) === String(b.dataset.r)))));
      };
      const review = (x) => modalForm({ title: `Review ${x.type.replace('_', '-')} request - ${x.full_name}`, intro: `Work date ${x.work_date}. Staff reason: ${x.reason}`,
        fields: [{ name: 'decision', label: 'Decision', type: 'select', value: 'approve', options: [{ value: 'approve', label: 'Approve and record the time below' }, { value: 'reject', label: 'Reject' }] },
          { name: 'time', label: 'Verified time (Ghana time; required to approve)', type: 'datetime-local', value: x.work_date + 'T08:00' },
          { name: 'note', label: 'Review note (required, recorded in the audit log)', type: 'textarea', required: true }], submitLabel: 'Submit decision',
        onSubmit: async (v) => { await api(`/admin/exceptions/${x.id}/review`, { method: 'POST', body: { decision: v.decision, note: v.note, time: v.decision === 'approve' ? inputToIso(v.time) : undefined } }); toast('Decision saved.'); load(); } });
      $('#s').onchange = () => load().catch(errToast); await load();
    },

    async schedules(main) {
      const rows = await get('/admin/schedules'), cur = rows.find((r) => r.effective_from <= todayStr());
      const prov = (r) => /PROVISIONAL/i.test(r.name);
      main.innerHTML = `<div class="row between"><h1>Work schedule and attendance rules</h1><button class="primary" id="add">New schedule</button></div>
        ${cur && prov(cur) ? '<div class="notice">The active schedule is <b>provisional</b> and not an official Skyboom policy. Create a new schedule once management confirms the rules.</div>' : ''}
        <p class="muted">A new schedule applies from its start date. Earlier attendance keeps the rules that applied when it was recorded.</p>
        <div class="card">${table([{ h: 'Effective from', v: (r) => r.effective_from }, { h: 'Name', v: (r) => r.name }, { h: 'Days', v: (r) => r.working_days.map((d) => dayName[d]).join(', ') },
          { h: 'Hours', v: (r) => `${r.start_time.slice(0, 5)} - ${r.end_time.slice(0, 5)}` }, { h: 'Grace', v: (r) => r.grace_minutes + ' min' }, { h: 'Absence deadline', v: (r) => r.absence_deadline.slice(0, 5) },
          { h: 'Early departure', v: (r) => (r.early_departure_enabled ? 'Tracked' : 'Not tracked') }, { h: 'In force', html: (r) => (cur && r.id === cur.id ? badge('active') : '') }], rows)}</div>`;
      $('#add').onclick = () => modalForm({ title: 'New schedule', fields: [
        { name: 'name', label: 'Name', value: 'Official schedule', required: true }, { name: 'working_days', label: 'Working days', type: 'days', value: cur ? cur.working_days : [1, 2, 3, 4, 5] },
        { name: 'start_time', label: 'Start time', type: 'time', value: cur ? cur.start_time.slice(0, 5) : '08:00', required: true }, { name: 'end_time', label: 'End time', type: 'time', value: cur ? cur.end_time.slice(0, 5) : '17:00', required: true },
        { name: 'grace_minutes', label: 'Late grace period (minutes)', type: 'number', min: 0, max: 240, value: cur ? cur.grace_minutes : 15, required: true },
        { name: 'absence_deadline', label: 'Absence deadline', type: 'time', value: cur ? cur.absence_deadline.slice(0, 5) : '10:00', required: true, hint: 'Staff with no check-in after this time on a working day count as absent.' },
        { name: 'early_departure_enabled', label: 'Track early departures (before end time)', type: 'checkbox', value: cur ? cur.early_departure_enabled : false },
        { name: 'effective_from', label: 'Effective from', type: 'date', value: todayStr(), min: todayStr(), required: true }], submitLabel: 'Save schedule',
        onSubmit: async (v) => { await api('/admin/schedules', { method: 'POST', body: { ...v, grace_minutes: Number(v.grace_minutes) } }); toast('Schedule saved.'); routes.schedules(main); } });
    },

    async office(main) {
      const o = await get('/admin/office');
      main.innerHTML = `<div class="row between"><h1>Office location</h1><button class="primary" id="edit">${o ? 'Change location' : 'Set location'}</button></div>
        ${o ? `<div class="card"><p><b>${esc(o.name)}</b></p><p>Latitude ${o.latitude}, longitude ${o.longitude}<br>Allowed radius: ${o.radius_m} m<br>Maximum GPS error accepted: ${o.max_accuracy_m} m</p></div>`
          : '<div class="notice">No office location is configured, so nobody can check in yet. Set the approved coordinates and radius.</div>'}
        <p class="muted">Check-ins and check-outs are accepted only inside this radius. The distance is calculated on the server.</p>`;
      $('#edit').onclick = () => {
        const d = modalForm({ title: 'Office location', fields: [{ name: 'name', label: 'Name', value: o?.name || 'Skyboom Ghana Limited - Head office', required: true },
          { name: 'latitude', label: 'Latitude', type: 'number', step: 'any', value: o?.latitude ?? '', required: true }, { name: 'longitude', label: 'Longitude', type: 'number', step: 'any', value: o?.longitude ?? '', required: true },
          { name: 'radius_m', label: 'Radius (metres)', type: 'number', value: o?.radius_m ?? 100, min: 10, max: 5000, required: true, hint: '100 m is proposed - confirm with management.' },
          { name: 'max_accuracy_m', label: 'Maximum GPS accuracy accepted (metres)', type: 'number', value: o?.max_accuracy_m ?? 50, min: 5, max: 1000, required: true },
          { name: 'reason', label: 'Reason for this change', type: 'textarea', required: true }], submitLabel: 'Save location',
          onSubmit: async (v) => { await api('/admin/office', { method: 'PUT', body: { name: v.name, latitude: Number(v.latitude), longitude: Number(v.longitude), radius_m: Number(v.radius_m), max_accuracy_m: Number(v.max_accuracy_m), reason: v.reason } }); toast('Location saved.'); routes.office(main); } });
        const use = document.createElement('button'); use.type = 'button'; use.className = 'small'; use.textContent = 'Use my current location (stand at the office)';
        $('#f_longitude', d).closest('.field').append(use);
        use.onclick = () => navigator.geolocation?.getCurrentPosition((p) => { $('#f_latitude', d).value = p.coords.latitude; $('#f_longitude', d).value = p.coords.longitude; toast(`Filled in (accuracy about ${Math.round(p.coords.accuracy)} m).`); }, (e) => toast('Could not get location: ' + e.message, 'error'), { enableHighAccuracy: true, timeout: 20000 });
      };
    },

    async reports(main) {
      const people = await staffOptions(); const first = todayStr().slice(0, 8) + '01';
      main.innerHTML = `<h1>Reports</h1><div class="card"><div class="row"><div><label for="f">From</label><input type="date" id="f" value="${first}"></div><div><label for="t">To</label><input type="date" id="t" value="${todayStr()}"></div>
        <div><label for="u">Staff</label>${sel('u', people.map((p) => [p.value, p.label]))}</div><div><label for="s">Status</label>${sel('s', statusOpts)}</div><button class="primary" id="go">Generate</button>
        <button id="csv" disabled>Download CSV</button><button id="pdf" disabled>Download PDF</button></div><div id="out"><div class="empty">Choose filters and select Generate.</div></div></div>`;
      const params = () => ({ from: $('#f').value, to: $('#t').value, user_id: $('#u').value, status: $('#s').value });
      $('#go').onclick = async () => {
        $('#out').innerHTML = '<div class="loading">Generating...</div>';
        try {
          const r = await get('/admin/reports' + qs(params())), t = r.totals;
          $('#out').innerHTML = `<div class="grid"><div class="stat"><span class="muted">Present</span><b>${t.present}</b></div><div class="stat flag"><span class="muted">Late</span><b>${t.late}</b></div><div class="stat flag"><span class="muted">Absent</span><b>${t.absent}</b></div>
            <div class="stat flag"><span class="muted">Incomplete</span><b>${t.incomplete}</b></div><div class="stat"><span class="muted">Early departures</span><b>${t.early_departures}</b></div></div>` +
            table([{ h: 'Date', v: (x) => x.date }, { h: 'Staff no', v: (x) => x.staff_no }, { h: 'Name', v: (x) => x.name }, { h: 'Department', v: (x) => x.department }, { h: 'Check-in', v: (x) => x.check_in }, { h: 'Check-out', v: (x) => x.check_out },
              { h: 'Status', v: (x) => x.status }, { h: 'Record', v: (x) => x.record }, { h: 'Early', v: (x) => x.early }], r.rows.slice(0, 500), 'No records match these filters.') + (r.rows.length > 500 ? '<p class="muted">Showing the first 500 rows; exports contain all rows.</p>' : '');
          $('#csv').disabled = $('#pdf').disabled = false;
        } catch (e) { $('#out').innerHTML = `<div class="notice" role="alert">${esc(e.message)}</div>`; $('#csv').disabled = $('#pdf').disabled = true; }
      };
      $('#csv').onclick = () => { location.href = '/api/admin/reports/export.csv' + qs(params()); };
      $('#pdf').onclick = () => { location.href = '/api/admin/reports/export.pdf' + qs(params()); };
    },

    async audit(main) {
      let page = 1;
      main.innerHTML = `<h1>Audit logs</h1><div class="card"><div class="row"><div><label for="a">Action starts with</label><input id="a" placeholder="e.g. attendance"></div><div><label for="f">From</label><input type="date" id="f"></div><div><label for="t">To</label><input type="date" id="t"></div><button class="primary" id="go">Apply</button></div>
        <div id="list"></div><div class="pager" id="pg"></div><p class="muted">Audit logs are read-only.</p></div>`;
      const load = async () => {
        const r = await api('/admin/audit-logs' + qs({ action: $('#a').value.trim(), from: $('#f').value, to: $('#t').value, page }));
        $('#list').innerHTML = table([{ h: 'When', v: (x) => fmtDateTime(x.created_at) }, { h: 'Who', v: (x) => x.actor_name || 'System' }, { h: 'Action', v: (x) => x.action }, { h: 'Item', v: (x) => `${x.entity || ''} ${x.entity_id || ''}` },
          { h: 'Reason', v: (x) => x.reason || '' }, { h: 'Before', v: (x) => (x.before_value ? JSON.stringify(x.before_value).slice(0, 80) : '') }, { h: 'After', v: (x) => (x.after_value ? JSON.stringify(x.after_value).slice(0, 80) : '') }], r.data, 'No log entries match.');
        pager($('#pg'), r.meta, page, (p) => { page = p; load().catch(errToast); });
      };
      $('#go').onclick = () => { page = 1; load().catch(errToast); }; await load();
    },

    async account(main) {
      main.innerHTML = `<h1>My account</h1><div class="card"><p><b>${esc(user.full_name)}</b><br>${esc(user.email)}<br>Administrator</p></div>
        ${user.must_change_password ? '<div class="notice">For security, choose a new password before using the system.</div>' : ''}
        <div class="card"><h2>Change password</h2><form id="pf" novalidate><div class="field"><label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="np">New password</label><input id="np" type="password" autocomplete="new-password" required><div class="muted">At least 10 characters, with letters and a number.</div></div>
        <div class="err" id="pe" role="alert"></div><button class="primary" type="submit">Change password</button></form></div>`;
      $('#pf').onsubmit = async (e) => { e.preventDefault(); $('#pe').textContent = '';
        try { await api('/auth/password', { method: 'POST', body: { current_password: $('#cp').value, new_password: $('#np').value } }); toast('Password changed.'); user.must_change_password = false; location.hash = 'dashboard'; } catch (ex) { $('#pe').textContent = ex.message; } };
    },
  };
  startRouter(routes, 'dashboard');
})().catch((e) => { document.body.innerHTML = `<p class="main">${esc(e.message)}</p>`; });

// Show/hide toggle for every password input, including ones created later (modals)
(function () {
  function enhance(input) {
    if (input.dataset.pwToggle || input.closest('.pw-wrap')) return;
    input.dataset.pwToggle = '1';
    var hadFocus = document.activeElement === input;

    var wrap = document.createElement('div');
    wrap.className = 'pw-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-toggle';
    btn.textContent = 'Show';
    btn.setAttribute('aria-label', 'Show password');
    btn.setAttribute('aria-pressed', 'false');
    if (input.id) btn.setAttribute('aria-controls', input.id);
    wrap.appendChild(btn);

    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      input.focus();
    });

    if (hadFocus) input.focus(); // moving the input in the DOM can drop focus
  }

  function scan(root) {
    if (root.matches && root.matches('input[type="password"]')) enhance(root);
    if (root.querySelectorAll) root.querySelectorAll('input[type="password"]').forEach(enhance);
  }

  scan(document);
  new MutationObserver(function (muts) {
    muts.forEach(function (m) {
      m.addedNodes.forEach(function (n) { if (n.nodeType === 1) scan(n); });
    });
  }).observe(document.body, { childList: true, subtree: true });
})();