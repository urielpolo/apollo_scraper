import { useState, useEffect, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// ── Auth helpers ──────────────────────────────────────────
function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser]   = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { if (u) setUser(u); else logout(); });
  }, [token]);

  function login(t)  { localStorage.setItem('token', t); setToken(t); }
  function logout()  { localStorage.removeItem('token'); setToken(null); setUser(null); }
  return { token, user, login, logout, setUser };
}

// ── Login screen ──────────────────────────────────────────
function LoginScreen({ onLogin, onSwitchToSignup }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    setLoading(false);
    if (data.token) onLogin(data.token);
    else setError(data.error || 'Login failed');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Apollo Scraper</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Sign in to your account</p>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Email</div>
            <input className="input" type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div className="label">Password</div>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <p style={{ color: '#e24b4a', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button className="btn btn-green" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 18 }}>
          Don't have an account?{' '}
          <span onClick={onSwitchToSignup} style={{ color: '#1d9e75', cursor: 'pointer', fontWeight: 500 }}>
            Sign up
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Signup screen ─────────────────────────────────────────
function SignupScreen({ onSignup, onSwitchToLogin }) {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const r = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, invite_code: inviteCode }),
    });
    const data = await r.json();
    setLoading(false);
    if (data.token) onSignup(data.token);
    else setError(data.error || 'Signup failed');
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <div className="card" style={{ width: 360, padding: 32 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>Create account</h1>
          <p style={{ color: '#888', fontSize: 13, marginTop: 4 }}>Join Apollo Scraper</p>
        </div>
        <form onSubmit={submit}>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Email</div>
            <input className="input" type="email" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 12 }}>
            <div className="label">Password</div>
            <input className="input" type="password" placeholder="••••••••"
              value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div className="label">Invite code</div>
            <input className="input" type="text" placeholder="Ask the group admin for this"
              value={inviteCode} onChange={e => setInviteCode(e.target.value)} required />
          </div>
          {error && <p style={{ color: '#e24b4a', fontSize: 13, marginBottom: 12 }}>{error}</p>}
          <button className="btn btn-green" type="submit" disabled={loading} style={{ width: '100%' }}>
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>
        <p style={{ textAlign: 'center', fontSize: 13, color: '#888', marginTop: 18 }}>
          Already have an account?{' '}
          <span onClick={onSwitchToLogin} style={{ color: '#1d9e75', cursor: 'pointer', fontWeight: 500 }}>
            Sign in
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Credit bar ────────────────────────────────────────────
function CreditBar({ used, limit }) {
  const pct   = Math.min((used / limit) * 100, 100);
  const color = pct > 90 ? '#e24b4a' : pct > 70 ? '#ef9f27' : '#1d9e75';
  const remaining = (limit - used).toLocaleString();
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
        <span style={{ fontWeight: 500 }}>Monthly leads</span>
        <span style={{ color: '#888' }}>{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div className="credit-bar-bg">
        <div className="credit-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{remaining} leads remaining this month</div>
    </div>
  );
}

// ── Live log stream ───────────────────────────────────────
function LogStream({ jobId, token }) {
  const [logs, setLogs] = useState([]);
  const endRef = useRef();

  useEffect(() => {
    if (!jobId) return;
    setLogs([]);
    const es = new EventSource(`${API}/jobs/${jobId}/logs?token=${token}`);
    es.onmessage = e => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, data.message]);
    };
    return () => es.close();
  }, [jobId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="log-box">
      {logs.length === 0
        ? <span style={{ color: '#666' }}>Waiting for logs...</span>
        : logs.map((l, i) => <div key={i} className="log-line">{l}</div>)
      }
      <div ref={endRef} />
    </div>
  );
}

// ── Install banner ────────────────────────────────────────
function InstallBanner() {
  const [prompt, setPrompt] = useState(null);
  const [show, setShow]     = useState(false);

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      setPrompt(e);
      setShow(true);
    });
  }, []);

  if (!show) return null;

  return (
    <div className="install-banner">
      <span>📲 Install this app on your desktop for quick access</span>
      <button className="btn btn-green" style={{ padding: '6px 14px', fontSize: 12 }}
        onClick={() => { prompt.prompt(); setShow(false); }}>
        Install
      </button>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────
function Dashboard({ token, user, onLogout, setUser }) {
  const [searchUrl, setSearchUrl] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [tab, setTab]             = useState('scrape');

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setUser);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchJobs() {
    const r = await fetch(`${API}/jobs`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await r.json();
    if (Array.isArray(data)) {
      setJobs(data);
      const running = data.find(j => j.status === 'running' || j.status === 'pending');
      if (running && !activeJob) setActiveJob(running.id);
    }
  }

  async function startJob() {
    if (!searchUrl.trim()) return;
    setLoading(true);
    const r = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_url: searchUrl }),
    });
    const data = await r.json();
    setLoading(false);
    if (data.job_id) {
      setActiveJob(data.job_id);
      setTab('scrape');
      fetchJobs();
    } else {
      alert(data.error || 'Failed to start job');
    }
  }

  async function stopJob() {
    if (!activeJob) return;
    await fetch(`${API}/jobs/${activeJob}/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setActiveJob(null);
    fetchJobs();
  }

  const activeJobData = jobs.find(j => j.id === activeJob);

  return (
    <div className="app">
      <InstallBanner />

      <div className="header">
        <h1>🔍 Apollo Scraper</h1>
        <button className="btn btn-gray" onClick={onLogout} style={{ padding: '6px 14px', fontSize: 13 }}>
          Sign out
        </button>
      </div>

      {user && (
        <div className="card">
          <CreditBar used={user.credits_used} limit={user.credits_limit} />
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['scrape', 'history'].map(t => (
          <button key={t} className="btn" onClick={() => setTab(t)}
            style={{ background: tab === t ? '#1d9e75' : '#eee', color: tab === t ? '#fff' : '#444', padding: '8px 20px' }}>
            {t === 'scrape' ? '▶ Scrape' : '🕐 History'}
          </button>
        ))}
      </div>

      {tab === 'scrape' && (
        <div className="card">
          <div className="label" style={{ marginBottom: 6 }}>Apollo search URL</div>
          <input className="input" placeholder="Paste your Apollo search URL here..."
            value={searchUrl} onChange={e => setSearchUrl(e.target.value)}
            style={{ marginBottom: 12 }} />

          <div className="row">
            <button className="btn btn-green" onClick={startJob}
              disabled={loading || !!activeJob || !searchUrl.trim()}>
              {loading ? 'Starting...' : '▶ Start scrape'}
            </button>
            <button className="btn btn-red" onClick={stopJob} disabled={!activeJob}>
              ■ Stop
            </button>
          </div>

          {activeJob && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="label">Live logs</div>
                {activeJobData && (
                  <span className={`status-badge status-${activeJobData.status}`}>
                    {activeJobData.status}
                  </span>
                )}
              </div>
              <LogStream jobId={activeJob} token={token} />
              {activeJobData && (
                <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
                  {activeJobData.leads_exported.toLocaleString()} leads exported this session
                </div>
              )}
            </div>
          )}

          {!activeJob && (
            <div style={{ marginTop: 20, textAlign: 'center', color: '#aaa', fontSize: 13 }}>
              No active scrape job. Paste a URL above and hit Start.
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="card">
          <div style={{ fontWeight: 500, marginBottom: 16 }}>Recent jobs</div>
          {jobs.length === 0 && (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
              No jobs yet — start your first scrape above.
            </div>
          )}
          {jobs.map(j => (
            <div key={j.id} className="job-row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>
                  {j.leads_exported.toLocaleString()} leads exported
                </div>
                <div style={{ fontSize: 11, color: '#aaa' }}>
                  {new Date(j.created_at).toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: '#aaa', maxWidth: 300,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {j.search_url}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span className={`status-badge status-${j.status}`}>{j.status}</span>
                {(j.status === 'running' || j.status === 'pending') && (
                  <button className="btn btn-red" style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={async () => {
                      await fetch(`${API}/jobs/${j.id}/stop`, {
                        method: 'POST', headers: { Authorization: `Bearer ${token}` }
                      });
                      fetchJobs();
                    }}>
                    Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────
export default function App() {
  const { token, user, login, logout, setUser } = useAuth();
  const [screen, setScreen] = useState('login'); // login | signup

  if (!token || !user) {
    return screen === 'login'
      ? <LoginScreen onLogin={login} onSwitchToSignup={() => setScreen('signup')} />
      : <SignupScreen onSignup={login} onSwitchToLogin={() => setScreen('login')} />;
  }

  return <Dashboard token={token} user={user} onLogout={logout} setUser={setUser} />;
}