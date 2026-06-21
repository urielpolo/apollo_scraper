const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Queue = require('bull');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const scraperQueue = new Queue('scraper', process.env.REDIS_URL);

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Register
app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await db.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, credits_used, credits_limit',
      [email, hash]
    );
    const token = jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET);
    res.json({ token, user: rows[0] });
  } catch {
    res.status(400).json({ error: 'Email already exists' });
  }
});

// Login
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET);
  res.json({ token, user: { id: rows[0].id, email: rows[0].email, credits_used: rows[0].credits_used, credits_limit: rows[0].credits_limit } });
});

// Get current user + credits
app.get('/me', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, email, credits_used, credits_limit, credits_reset_at FROM users WHERE id = $1',
    [req.user.id]
  );
  res.json(rows[0]);
});

// Start a scraper job
app.post('/jobs', auth, async (req, res) => {
  const { search_url } = req.body;
  if (!search_url) return res.status(400).json({ error: 'search_url required' });

  // Check credits
  const { rows: [user] } = await db.query(
    'SELECT credits_used, credits_limit FROM users WHERE id = $1',
    [req.user.id]
  );
  const remaining = user.credits_limit - user.credits_used;
  if (remaining <= 0) {
    return res.status(403).json({ error: 'Monthly credit limit reached (10,000 leads)' });
  }

  // Create job record
  const { rows: [job] } = await db.query(
    'INSERT INTO jobs (user_id, search_url, status) VALUES ($1, $2, $3) RETURNING *',
    [req.user.id, search_url, 'pending']
  );

  // Add to Bull queue
  const bullJob = await scraperQueue.add({
    job_id: job.id,
    user_id: req.user.id,
    search_url,
    credits_remaining: remaining,
  });

  // Save Bull job ID
  await db.query('UPDATE jobs SET bull_id = $1 WHERE id = $2', [bullJob.id, job.id]);

  res.json({ job_id: job.id, status: 'queued' });
});

// Stop a job
app.post('/jobs/:id/stop', auth, async (req, res) => {
  const { rows: [job] } = await db.query(
    'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (job.bull_id) {
    const bullJob = await scraperQueue.getJob(job.bull_id);
    if (bullJob) await bullJob.remove();
  }

  await db.query("UPDATE jobs SET status = 'stopped' WHERE id = $1", [job.id]);
  res.json({ success: true });
});

// Get all jobs for user
app.get('/jobs', auth, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20',
    [req.user.id]
  );
  res.json(rows);
});

// Get logs for a job (SSE stream)
app.get('/jobs/:id/logs', auth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send existing logs first
  const { rows } = await db.query(
    'SELECT message, created_at FROM logs WHERE job_id = $1 ORDER BY created_at ASC',
    [req.params.id]
  );
  rows.forEach(r => res.write(`data: ${JSON.stringify(r)}\n\n`));

  // Poll for new logs every 2s
  const interval = setInterval(async () => {
    const lastSent = rows[rows.length - 1]?.created_at || new Date(0);
    const { rows: newRows } = await db.query(
      'SELECT message, created_at FROM logs WHERE job_id = $1 AND created_at > $2 ORDER BY created_at ASC',
      [req.params.id, lastSent]
    );
    newRows.forEach(r => {
      rows.push(r);
      res.write(`data: ${JSON.stringify(r)}\n\n`);
    });
  }, 2000);

  req.on('close', () => clearInterval(interval));
});

app.listen(3001, () => console.log('API running on port 3001'));