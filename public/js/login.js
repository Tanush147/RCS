// ── Login Page Logic ──

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('loginBtn');
  const errorEl = document.getElementById('loginError');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;

  if (!username || !password) return;

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    // Redirect based on role
    if (data.user.role === 'admin') {
      window.location.href = '/admin';
    } else if (data.user.role === 'supervisor') {
      window.location.href = '/supervisor';
    }
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.innerHTML = 'Sign In';
  }
});

// Check if already logged in
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user.role === 'admin') window.location.href = '/admin';
      else if (data.user.role === 'supervisor') window.location.href = '/supervisor';
    }
  } catch (e) { /* not logged in */ }
})();
