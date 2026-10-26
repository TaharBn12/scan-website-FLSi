const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { readDb, writeDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
// In production, set the JWT_SECRET environment variable to something
// long and random instead of relying on this default.
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Auth helpers ----------

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: '30d',
  });
}

function requireAuth(req, res, next) {
  const token = req.cookies.auth_token;
  if (!token) return res.redirect('/login');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const db = readDb();
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) return res.redirect('/login');
    req.user = user;
    next();
  } catch (e) {
    return res.redirect('/login');
  }
}

// ---------- Pages: auth ----------

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.render('register', { error: 'Please fill in all fields.' });
  }

  const db = readDb();
  const existing = db.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase()
  );
  if (existing) {
    return res.render('register', {
      error: 'An account with this email already exists.',
    });
  }

  const user = {
    id: uuidv4(),
    name,
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    scanToken: null, // pasted in later from the phone app's Settings screen
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDb(db);

  const token = signToken(user);
  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.redirect('/settings');
});

app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find(
    (u) => u.email.toLowerCase() === (email || '').toLowerCase()
  );
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.render('login', { error: 'Incorrect email or password.' });
  }
  const token = signToken(user);
  res.cookie('auth_token', token, {
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.redirect('/login');
});

// ---------- Pages: app (protected) ----------

app.get('/dashboard', requireAuth, (req, res) => {
  const db = readDb();
  const scans = db.scans
    .filter((s) => s.userId === req.user.id)
    .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  res.render('dashboard', { user: req.user, scans, active: 'dashboard' });
});

app.get('/settings', requireAuth, (req, res) => {
  const apiUrl = `${req.protocol}://${req.get('host')}/api/scan`;
  res.render('settings', {
    user: req.user,
    saved: false,
    active: 'settings',
    apiUrl,
  });
});

app.post('/settings/token', requireAuth, (req, res) => {
  const { scanToken } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.id);
  user.scanToken = (scanToken || '').trim() || null;
  writeDb(db);
  const apiUrl = `${req.protocol}://${req.get('host')}/api/scan`;
  res.render('settings', {
    user,
    saved: true,
    active: 'settings',
    apiUrl,
  });
});

// ---------- API ----------

// Called by the phone app on every barcode scan.
// Body: { token, barcode, productName, price, scannedAt }
// Auth: Authorization: Bearer <token>  (or the token field in the body)
app.post('/api/scan', (req, res) => {
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : null;
  const token = bearerToken || req.body.token;

  if (!token) {
    return res.status(401).json({ error: 'Missing token' });
  }
  if (!req.body.barcode) {
    return res.status(400).json({ error: 'Missing barcode' });
  }

  const db = readDb();
  const user = db.users.find((u) => u.scanToken === token);
  if (!user) {
    return res.status(401).json({ error: 'Unknown token' });
  }

  const scan = {
    id: uuidv4(),
    userId: user.id,
    barcode: req.body.barcode,
    productName: req.body.productName || null,
    price: typeof req.body.price === 'number' ? req.body.price : null,
    scannedAt: req.body.scannedAt || new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };
  db.scans.push(scan);
  writeDb(db);

  res.status(201).json({ ok: true, id: scan.id });
});

// Used by the dashboard page to poll for new scans without a full reload.
app.get('/api/scans', requireAuth, (req, res) => {
  const db = readDb();
  const scans = db.scans
    .filter((s) => s.userId === req.user.id)
    .sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  res.json({ scans });
});

app.listen(PORT, () => {
  console.log(`Scan dashboard running on http://localhost:${PORT}`);
});
