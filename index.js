const express = require('express');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory data storage
const users = []; // { id, username, salt, hash, createdAt }
const sessions = new Map(); // token -> { userId, username, createdAt }
const notes = [
  {
    id: 1,
    title: 'Welcome to SimpleNotes',
    text: 'This is your first note. Log in to create notes with your username!',
    author: 'Admin',
    createdAt: new Date().toISOString()
  }
];

// Cryptography Helpers (Secure Password Hashing with Salt)
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Authentication Middleware
function authMiddleware(required = true) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (required) {
        return res.status(401).json({ error: 'Authentication required. Missing token.' });
      }
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    const session = sessions.get(token);

    if (!session) {
      if (required) {
        return res.status(401).json({ error: 'Invalid or expired session token.' });
      }
      req.user = null;
      return next();
    }

    req.token = token;
    req.user = { id: session.userId, username: session.username };
    next();
  };
}

// --- AUTHENTICATION ROUTES ---

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
  }

  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const cleanUsername = username.trim();
  const existingUser = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'Username is already taken.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  const newUser = {
    id: users.length + 1,
    username: cleanUsername,
    salt,
    hash,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);

  // Auto-login upon registration
  const token = generateToken();
  sessions.set(token, {
    userId: newUser.id,
    username: newUser.username,
    createdAt: new Date()
  });

  res.status(201).json({
    message: 'User registered successfully',
    token,
    user: { id: newUser.id, username: newUser.username }
  });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUsername = username.trim();
  const user = users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const calculatedHash = hashPassword(password, user.salt);
  // Constant-time comparison to prevent timing attacks
  const isMatch = crypto.timingSafeEqual(
    Buffer.from(calculatedHash, 'hex'),
    Buffer.from(user.hash, 'hex')
  );

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid username or password.' });
  }

  const token = generateToken();
  sessions.set(token, {
    userId: user.id,
    username: user.username,
    createdAt: new Date()
  });

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, username: user.username }
  });
});

// GET /api/auth/me (Get profile of current logged-in user)
app.get('/api/auth/me', authMiddleware(true), (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
app.post('/api/auth/logout', authMiddleware(false), (req, res) => {
  if (req.token) {
    sessions.delete(req.token);
  }
  res.json({ message: 'Logged out successfully' });
});

// --- NOTES ROUTES ---

// GET /notes & /api/notes
const getNotesHandler = (req, res) => {
  res.json(notes);
};
app.get('/notes', getNotesHandler);
app.get('/api/notes', getNotesHandler);

// POST /notes & /api/notes (Supports both anonymous curl and authenticated web users)
const postNoteHandler = (req, res) => {
  const { text, title } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const author = req.user ? req.user.username : 'Anonymous';
  const note = {
    id: notes.length + 1,
    title: (title && title.trim()) || 'Untitled',
    text: text.trim(),
    author,
    createdAt: new Date().toISOString()
  };

  notes.push(note);
  res.status(201).json(note);
};
app.post('/notes', authMiddleware(false), postNoteHandler);
app.post('/api/notes', authMiddleware(false), postNoteHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`SimpleNotes App & API running on port ${PORT}`));
