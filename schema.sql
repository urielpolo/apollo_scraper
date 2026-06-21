CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  credits_used INTEGER DEFAULT 0,
  credits_limit INTEGER DEFAULT 10000,
  credits_reset_at TIMESTAMP DEFAULT (date_trunc('month', now()) + interval '1 month'),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  bull_id TEXT,
  search_url TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  leads_exported INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE logs (
  id SERIAL PRIMARY KEY,
  job_id UUID REFERENCES jobs(id),
  message TEXT,
  created_at TIMESTAMP DEFAULT now()
);