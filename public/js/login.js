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
