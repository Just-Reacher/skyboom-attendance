$('#f').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#err'), btn = $('#go'); err.textContent = '';
  const email = $('#email').value.trim(), password = $('#pw').value;
  if (!email || !password) { err.textContent = 'Enter your email and password.'; return; }
  btn.disabled = true; btn.textContent = 'Logging in...';
  try {
    const { data } = await api('/auth/login', { method: 'POST', body: { email, password } });
    location.href = data.user.role === 'admin' ? '/admin' : '/staff';
  } catch (ex) { err.textContent = ex.message; btn.disabled = false; btn.textContent = 'Log in'; }
});

(function () {
  var pw = document.getElementById('pw');
  var btn = document.getElementById('pwToggle');
  if (!pw || !btn) return;

  btn.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    btn.textContent = show ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pw.focus();
  });
})();
