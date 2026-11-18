// SimpleNotes Frontend Client
(function () {
  'use strict';

  // --- STATE ---
  let state = {
    token: localStorage.getItem('sn_token') || null,
    user: JSON.parse(localStorage.getItem('sn_user') || 'null'),
    authMode: 'login' // 'login' | 'register'
  };

  // --- DOM ELEMENTS ---
  const navAuth = document.getElementById('navAuth');
  const heroGreeting = document.getElementById('heroGreeting');
  const authorIndicator = document.getElementById('authorIndicator');
  const notesGrid = document.getElementById('notesGrid');
  const notesCount = document.getElementById('notesCount');
  const noteForm = document.getElementById('noteForm');
  const noteTitle = document.getElementById('noteTitle');
  const noteText = document.getElementById('noteText');
  const noteFeedback = document.getElementById('noteFeedback');
  const refreshNotesBtn = document.getElementById('refreshNotesBtn');

  // Modal elements
  const authModal = document.getElementById('authModal');
  const closeAuthModal = document.getElementById('closeAuthModal');
  const tabLogin = document.getElementById('tabLogin');
  const tabRegister = document.getElementById('tabRegister');
  const authForm = document.getElementById('authForm');
  const authUsername = document.getElementById('authUsername');
  const authPassword = document.getElementById('authPassword');
  const authSubmitBtn = document.getElementById('authSubmitBtn');
  const authAlert = document.getElementById('authAlert');
  const authHint = document.getElementById('authHint');
  const switchTabLink = document.getElementById('switchTabLink');

  // --- HELPERS ---
  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) {
      headers['Authorization'] = `Bearer ${state.token}`;
    }
    return headers;
  }

  function setAuthData(token, user) {
    state.token = token;
    state.user = user;
    if (token) {
      localStorage.setItem('sn_token', token);
      localStorage.setItem('sn_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sn_token');
      localStorage.removeItem('sn_user');
    }
    updateAuthUI();
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    const date = new Date(isoStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + date.toLocaleDateString();
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  // --- UI UPDATERS ---
  function updateAuthUI() {
    if (state.user && state.token) {
      // User is logged in
      const initial = state.user.username.charAt(0).toUpperCase();
      navAuth.innerHTML = `
        <div class="user-pill">
          <span class="user-avatar">${escapeHtml(initial)}</span>
          <span class="user-name">${escapeHtml(state.user.username)}</span>
        </div>
        <button class="btn btn-outline" id="logoutBtn">Sign Out</button>
      `;

      heroGreeting.textContent = `Welcome back, ${state.user.username}!`;
      authorIndicator.innerHTML = `Posting as: <strong style="color: var(--primary);">${escapeHtml(state.user.username)}</strong>`;

      document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    } else {
      // Guest / Logged out
      navAuth.innerHTML = `
        <button class="btn btn-outline" id="loginNavBtn">Sign In</button>
        <button class="btn btn-primary" id="registerNavBtn">Register</button>
      `;

      heroGreeting.textContent = 'Capture Thoughts, Simply.';
      authorIndicator.innerHTML = `Posting as: <em>Anonymous</em> (Sign in to tag your notes)`;

      document.getElementById('loginNavBtn').addEventListener('click', () => openModal('login'));
      document.getElementById('registerNavBtn').addEventListener('click', () => openModal('register'));
    }
  }

  // --- API CALLS ---
  async function verifySession() {
    if (!state.token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: getAuthHeaders() });
      if (!res.ok) {
        // Token expired or invalid
        setAuthData(null, null);
      } else {
        const data = await res.json();
        setAuthData(state.token, data.user);
      }
    } catch (err) {
      console.warn('Session verification error:', err);
    }
  }

  async function loadNotes() {
    try {
      const res = await fetch('/notes');
      if (!res.ok) throw new Error('Failed to fetch notes');
      const notes = await res.json();
      renderNotes(notes);
    } catch (err) {
      notesGrid.innerHTML = `<div class="empty-state">Could not load notes: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderNotes(notes) {
    notesCount.textContent = notes.length;
    if (!notes.length) {
      notesGrid.innerHTML = `
        <div class="empty-state">
          <p>No notes found yet. Be the first to post a note!</p>
        </div>
      `;
      return;
    }

    // Display newest notes first
    const sorted = [...notes].reverse();
    notesGrid.innerHTML = sorted.map(note => `
      <article class="note-item">
        <div class="note-item-header">
          <h3 class="note-title">${escapeHtml(note.title || 'Untitled')}</h3>
          <div class="note-meta">
            <span class="note-author">${escapeHtml(note.author || 'Anonymous')}</span>
            <span class="note-date">${formatDate(note.createdAt)}</span>
          </div>
        </div>
        <p class="note-body">${escapeHtml(note.text)}</p>
      </article>
    `).join('');
  }

  async function handleNoteSubmit(e) {
    e.preventDefault();
    const title = noteTitle.value.trim();
    const text = noteText.value.trim();

    if (!text) return;

    noteFeedback.textContent = 'Saving...';
    noteFeedback.className = 'feedback-msg';

    try {
      const res = await fetch('/notes', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ title, text })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save note');
      }

      noteTitle.value = '';
      noteText.value = '';
      noteFeedback.textContent = '✓ Note saved!';
      setTimeout(() => { noteFeedback.textContent = ''; }, 3000);

      loadNotes();
    } catch (err) {
      noteFeedback.textContent = err.message;
      noteFeedback.className = 'feedback-msg error';
    }
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    const username = authUsername.value.trim();
    const password = authPassword.value;

    if (!username || !password) return;

    authAlert.className = 'auth-alert hidden';
    authAlert.textContent = '';
    authSubmitBtn.disabled = true;
    authSubmitBtn.textContent = state.authMode === 'login' ? 'Signing in...' : 'Creating account...';

    const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed');
      }

      // Successful Auth
      setAuthData(data.token, data.user);
      closeModal();
      loadNotes(); // Refresh to reflect author status
    } catch (err) {
      authAlert.textContent = err.message;
      authAlert.className = 'auth-alert error';
    } finally {
      authSubmitBtn.disabled = false;
      authSubmitBtn.textContent = state.authMode === 'login' ? 'Sign In' : 'Create Account';
    }
  }

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders()
      });
    } catch (_) {
      // Ignore network errors on logout
    }
    setAuthData(null, null);
    loadNotes();
  }

  // --- MODAL CONTROLS ---
  function openModal(mode = 'login') {
    setAuthMode(mode);
    authAlert.className = 'auth-alert hidden';
    authUsername.value = '';
    authPassword.value = '';
    authModal.classList.remove('hidden');
    setTimeout(() => authUsername.focus(), 100);
  }

  function closeModal() {
    authModal.classList.add('hidden');
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    if (mode === 'login') {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      authSubmitBtn.textContent = 'Sign In';
      authHint.innerHTML = `Don't have an account? <a href="#" id="switchTabLink">Create one now</a>`;
    } else {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      authSubmitBtn.textContent = 'Create Account';
      authHint.innerHTML = `Already have an account? <a href="#" id="switchTabLink">Sign In here</a>`;
    }
    // Re-bind dynamic switch link
    document.getElementById('switchTabLink').addEventListener('click', (e) => {
      e.preventDefault();
      setAuthMode(state.authMode === 'login' ? 'register' : 'login');
    });
  }

  // --- EVENT LISTENERS ---
  noteForm.addEventListener('submit', handleNoteSubmit);
  refreshNotesBtn.addEventListener('click', loadNotes);

  tabLogin.addEventListener('click', () => setAuthMode('login'));
  tabRegister.addEventListener('click', () => setAuthMode('register'));
  closeAuthModal.addEventListener('click', closeModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !authModal.classList.contains('hidden')) {
      closeModal();
    }
  });

  authForm.addEventListener('submit', handleAuthSubmit);

  // --- INITIALIZATION ---
  updateAuthUI();
  verifySession().then(loadNotes);
})();
