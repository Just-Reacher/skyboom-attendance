(async () => {
  const { user } = await get('/auth/me');
  setupShell(user, [['dashboard', 'Dashboard'], ['history', 'My history'], ['profile', 'Profile & password']]);
  if (user.must_change_password) location.hash = 'profile';

  const getPosition = () => new Promise((res, rej) => {
    if (!navigator.geolocation) return rej(new Error('This browser does not support location. Use another device or submit an exception request.'));
    navigator.geolocation.getCurrentPosition(
      (p) => res({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => rej(new Error(e.code === 1 ? 'Location permission was denied. Allow location for this site in your browser settings and try again.'
        : e.code === 3 ? 'Finding your location timed out. Move near a window or outdoors and try again.' : 'Your location is unavailable. Turn on GPS/location services and try again.')),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });

  const routes = {
    async dashboard(main) {
      if (user.must_change_password) { location.hash = 'profile'; return; }
      const [t, hist, ex] = await Promise.all([get('/attendance/today'), api('/attendance/history?limit=7'), get('/attendance/exceptions')]);
      const r = t.record;
      main.innerHTML = `<h1>Welcome, ${esc(user.full_name.split(' ')[0])}</h1>
        <div class="card"><div class="clock" id="clock"></div><div class="muted">Ghana time (Africa/Accra)${t.schedule ? ` - working hours ${esc(t.schedule.start_time.slice(0, 5))} to ${esc(t.schedule.end_time.slice(0, 5))}, grace ${t.schedule.grace_minutes} min` : ''}</div></div>
        <div class="grid">
          <div class="stat"><span class="muted">Check-in</span><b>${fmtTime(r?.check_in_at)}</b></div>
          <div class="stat"><span class="muted">Check-out</span><b>${fmtTime(r?.check_out_at)}</b></div>
          <div class="stat ${r?.status === 'late' || r?.state === 'incomplete' ? 'flag' : ''}"><span class="muted">Status today</span><b class="sm">${r ? badge(r.status) + ' ' + badge(r.state) : 'Not checked in'}</b></div>
        </div>
        <div class="card"><h2>Record attendance</h2>
          ${t.reason ? `<div class="notice">${esc(t.reason)}</div>` : ''}
          <div class="err" id="locerr" role="alert"></div>
          <button class="primary bigbtn" id="act" ${t.canCheckIn || t.canCheckOut ? '' : 'disabled'}>${t.canCheckOut ? 'Check out' : 'Check in'}</button>
          <p class="muted">Your browser will ask for your location. It is used only to confirm you are at the office.</p></div>
        <div class="card"><h2>Recent attendance</h2>${recentTable(hist.data)}</div>
        <div class="card"><div class="row between"><h2>Exception requests</h2><button id="newex" class="small">Request exception</button></div>
          <p class="muted">Use this if location or your device failed and an administrator needs to review your attendance.</p>
          ${table([{ h: 'Date', v: (x) => x.work_date }, { h: 'Type', v: (x) => x.type.replace('_', '-') }, { h: 'Status', html: (x) => badge(x.status) }, { h: 'Admin note', v: (x) => x.review_note || '' }], ex, 'No exception requests.')}</div>`;
      const tick = () => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-GB', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit' }); else clearInterval(iv); };
      const iv = setInterval(tick, 1000); tick();
      $('#act').onclick = async (e) => {
        const btn = e.target, label = btn.textContent; $('#locerr').textContent = '';
        btn.disabled = true; btn.textContent = 'Finding your location...';
        try {
          const pos = await getPosition();
          btn.textContent = 'Recording...';
          await api(t.canCheckOut ? '/attendance/check-out' : '/attendance/check-in', { method: 'POST', body: pos });
          toast(t.canCheckOut ? 'Checked out.' : 'Checked in.'); routes.dashboard(main);
        } catch (ex) { $('#locerr').textContent = ex.message; btn.disabled = false; btn.textContent = label; if (ex.status === 409) routes.dashboard(main); }
      };
      $('#newex').onclick = () => modalForm({ title: 'Request an attendance exception', intro: 'An administrator will review this. Give the reason attendance could not be recorded normally.',
        fields: [{ name: 'work_date', label: 'Work date', type: 'date', value: todayStr(), required: true },
          { name: 'type', label: 'What is missing?', type: 'select', value: 'check_in', options: [{ value: 'check_in', label: 'Check-in' }, { value: 'check_out', label: 'Check-out' }] },
          { name: 'reason', label: 'Reason', type: 'textarea', required: true }], submitLabel: 'Send request',
        onSubmit: async (v) => { await api('/attendance/exceptions', { method: 'POST', body: v }); toast('Request sent.'); routes.dashboard(main); } });
    },
    async history(main) {
      let page = 1; const f = { from: '', to: '', status: '' };
      main.innerHTML = `<h1>My attendance history</h1><div class="card"><div class="row">
        <div><label for="hf">From</label><input type="date" id="hf"></div><div><label for="ht">To</label><input type="date" id="ht"></div>
        <div><label for="hs">Status</label><select id="hs"><option value="">All</option><option value="on_time">On time</option><option value="late">Late</option><option value="incomplete">Incomplete</option><option value="early_departure">Early departure</option></select></div>
        <button class="primary" id="hgo">Apply</button></div><div id="hl"></div><div class="pager" id="hp"></div></div>`;
      const load = async () => {
        $('#hl').innerHTML = '<div class="loading">Loading...</div>';
        const r = await api('/attendance/history' + qs({ ...f, page }));
        $('#hl').innerHTML = recentTable(r.data); pager($('#hp'), r.meta, page, (p) => { page = p; load(); });
      };
      $('#hgo').onclick = () => { f.from = $('#hf').value; f.to = $('#ht').value; f.status = $('#hs').value; page = 1; load().catch((e) => toast(e.message, 'error')); };
      await load();
    },
    async profile(main) {
      main.innerHTML = `<h1>Profile</h1><div class="card"><p><b>${esc(user.full_name)}</b><br>${esc(user.email)}<br>Staff no: ${esc(user.staff_no)}${user.department ? '<br>Department: ' + esc(user.department) : ''}</p></div>
        ${user.must_change_password ? '<div class="notice">For security, choose a new password before using the system.</div>' : ''}
        <div class="card"><h2>Change password</h2><form id="pf" novalidate>
        <div class="field"><label for="cp">Current password</label><input id="cp" type="password" autocomplete="current-password" required></div>
        <div class="field"><label for="np">New password</label><input id="np" type="password" autocomplete="new-password" required><div class="muted">At least 10 characters, with letters and a number.</div></div>
        <div class="err" id="pe" role="alert"></div><button class="primary" type="submit">Change password</button></form></div>`;
      $('#pf').onsubmit = async (e) => {
        e.preventDefault(); $('#pe').textContent = '';
        try { await api('/auth/password', { method: 'POST', body: { current_password: $('#cp').value, new_password: $('#np').value } }); toast('Password changed.'); user.must_change_password = false; location.hash = 'dashboard'; }
        catch (ex) { $('#pe').textContent = ex.message; }
      };
    },
  };
  function recentTable(rows) {
    return table([{ h: 'Date', v: (r) => fmtDate(r.work_date) }, { h: 'Check-in', v: (r) => fmtTime(r.check_in_at) }, { h: 'Check-out', v: (r) => fmtTime(r.check_out_at) },
      { h: 'Status', html: (r) => badge(r.status) + (r.early_departure ? ' <span class="badge incomplete">Early</span>' : '') }, { h: 'Record', html: (r) => badge(r.state) }], rows, 'No attendance records yet.');
  }
  startRouter(routes, 'dashboard');
})().catch((e) => { document.body.innerHTML = `<p class="main">${esc(e.message)}</p>`; });
