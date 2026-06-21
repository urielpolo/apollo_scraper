import { useState, useEffect, useRef } from 'react';

const API = 'http://localhost:3001';

function useAuth() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setUser);
  }, [token]);

  function login(t) { localStorage.setItem('token', t); setToken(t); }
  function logout() { localStorage.removeItem('token'); setToken(null); setUser(null); }

  return { token, user, login, logout };
}

function LoginForm({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const r = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (data.token) onLogin(data.token);
    else setError(data.error);
  }

  return (
    <div style={{ maxWidth: 360, margin: '80px auto', padding: 24 }}>
      <h2>Apollo Scraper</h2>
      <form onSubmit={submit}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }} />
        <input type="password" placeholder="Password" value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ display: 'block', width: '100%', marginBottom: 12, padding: 8 }} />
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" style={{ width: '100%', padding: 10 }}>Login</button>
      </form>
    </div>
  );
}

function CreditBar({ used, limit }) {
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct > 90 ? '#e24b4a' : pct > 70 ? '#ef9f27' : '#1d9e75';
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
        <span>Monthly leads</span>
        <span>{used.toLocaleString()} / {limit.toLocaleString()}</span>
      </div>
      <div style={{ height: 8, background: '#e0e0e0', borderRadius: 4 }}>
        <div style={{ height: 8, width: `${pct}%`, background: color, borderRadius: 4, transition: 'width .3s' }} />
      </div>
    </div>
  );
}

function LogStream({ jobId, token }) {
  const [logs, setLogs] = useState([]);
  const endRef = useRef();

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`${API}/jobs/${jobId}/logs?token=${token}`);
    es.onmessage = e => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, data.message]);
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
    };
    return () => es.close();
  }, [jobId]);

  return (
    <div style={{ background: '#111', color: '#ccc', fontFamily: 'monospace', fontSize: 12,
      padding: 12, borderRadius: 8, height: 200, overflowY: 'auto', marginTop: 12 }}>
      {logs.map((l, i) => <div key={i}>{l}</div>)}
      <div ref={endRef} />
    </div>
  );
}

export default function App() {
  const { token, user, login, logout } = useAuth();
  const [searchUrl, setSearchUrl] = useState('');
  const [activeJob, setActiveJob] = useState(null);
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/jobs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(setJobs);
  }, [token, activeJob]);

  async function startJob() {
    const r = await fetch(`${API}/jobs`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ search_url: searchUrl }),
    });
    const data = await r.json();
    if (data.job_id) setActiveJob(data.job_id);
    else alert(data.error);
  }

  async function stopJob() {
    if (!activeJob) return;
    await fetch(`${API}/jobs/${activeJob}/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    setActiveJob(null);
  }

  if (!token) return <LoginForm onLogin={login} />;

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Apollo Scraper</h2>
        <button onClick={logout}>Logout</button>
      </div>

      {user && <CreditBar used={user.credits_used} limit={user.credits_limit} />}

      <div style={{ marginBottom: 24 }}>
        <input
          placeholder="Paste Apollo search URL here..."
          value={searchUrl}
          onChange={e => setSearchUrl(e.target.value)}
          style={{ width: '100%', padding: 10, marginBottom: 8, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={startJob} disabled={!!activeJob || !searchUrl}
            style={{ flex: 1, padding: 10, background: '#1d9e75', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            ▶ Start scrape
          </button>
          <button onClick={stopJob} disabled={!activeJob}
            style={{ flex: 1, padding: 10, background: '#e24b4a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            ■ Stop
          </button>
        </div>
      </div>

      {activeJob && <LogStream jobId={activeJob} token={token} />}

      <h3>Recent jobs</h3>
      {jobs.map(j => (
        <div key={j.id} style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: '#888' }}>{new Date(j.created_at).toLocaleString()}</span>
            <span style={{ fontSize: 12, fontWeight: 500,
              color: j.status === 'done' ? '#1d9e75' : j.status === 'failed' ? '#e24b4a' : '#ef9f27' }}>
              {j.status}
            </span>
          </div>
          <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{j.leads_exported.toLocaleString()} leads exported</div>
        </div>
      ))}
    </div>
  );
}