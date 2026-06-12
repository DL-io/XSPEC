'use client';

import { useState } from 'react';

export default function WelcomePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setErrorMsg(data.error ?? 'Something went wrong.'); setStatus('error'); return; }
      setStatus('success');
    } catch {
      setErrorMsg('Network error. Please try again.');
      setStatus('error');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--mono)', overflowX: 'hidden' }}>
      {/* Hero */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '96px 24px 64px' }}>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--accent)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Early Access</span>
        </div>
        <h1 style={{ fontSize: 'clamp(32px, 6vw, 56px)', fontWeight: 700, lineHeight: 1.1, marginBottom: 20, color: 'var(--text)' }}>
          Institutional prediction<br />market infrastructure —<br /><span style={{ color: 'var(--accent)' }}>available for operators.</span>
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.7, maxWidth: 580, marginBottom: 40 }}>
          XSPEC is a production-grade trading terminal for Polymarket and Kalshi. Multi-model ensemble forecasting, automated execution, risk management, and a full audit trail — built for operators who run books, not just accounts.
        </p>
        <a href="#access" style={{ display: 'inline-block', background: 'var(--accent)', color: '#fff', padding: '12px 28px', borderRadius: 6, fontSize: 14, fontWeight: 600, textDecoration: 'none', letterSpacing: '0.02em' }}>
          Request Early Access
        </a>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', maxWidth: 760, margin: '0 auto' }} />

      {/* What You Get */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '64px 24px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 32, color: 'var(--text)' }}>What you get</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
          {FEATURES.map((f) => (
            <div key={f.title} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 24 }}>
              <div style={{ fontSize: 20, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{f.title}</div>
              <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)', maxWidth: 760, margin: '0 auto' }} />

      {/* Request Early Access Form */}
      <div id="access" style={{ maxWidth: 520, margin: '0 auto', padding: '64px 24px 96px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text)' }}>Request early access</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 32, lineHeight: 1.6 }}>
          We onboard operators manually. Tell us a bit about yourself and how you plan to use XSPEC.
        </p>

        {status === 'success' ? (
          <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 8, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 20, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, color: 'var(--green)', fontWeight: 600, marginBottom: 4 }}>Application received</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>We'll be in touch within a few days.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Name</label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)} required
                placeholder="Your name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Email</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tell us about yourself</label>
              <textarea
                value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10}
                rows={4}
                placeholder="How do you currently trade prediction markets? What scale are you operating at? What would you use XSPEC for?"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>
            {status === 'error' && (
              <div style={{ fontSize: 13, color: 'var(--red)' }}>{errorMsg}</div>
            )}
            <button
              type="submit" disabled={status === 'submitting'}
              style={{ background: 'var(--accent)', border: 'none', borderRadius: 6, color: '#fff', cursor: status === 'submitting' ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 600, opacity: status === 'submitting' ? 0.7 : 1, padding: '12px 24px', fontFamily: 'var(--mono)' }}
            >
              {status === 'submitting' ? 'Submitting…' : 'Request Access'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)',
  fontFamily: 'var(--mono)', fontSize: 13, outline: 'none', padding: '10px 14px', width: '100%', boxSizing: 'border-box'
};

const FEATURES = [
  { icon: '⚡', title: 'Multi-model ensemble forecasting', body: 'LLM ensemble (GPT-4, Claude, Gemini, Groq) with calibration-weighted probability estimates and confidence scoring.' },
  { icon: '📊', title: 'Automated execution engine', body: 'Kelly-sized orders with edge thresholds, venue-native CLOB integration for Polymarket and Kalshi, full fill tracking.' },
  { icon: '🛡', title: 'Institutional risk controls', body: 'Daily loss limits, drawdown gates, kill switch, position concentration limits, and reconciliation alerting.' },
  { icon: '🔍', title: 'Full audit trail', body: 'Every decision — scanner input, ensemble output, edge calc, risk check, order result — logged and queryable.' },
  { icon: '📈', title: 'Operator terminal', body: 'Real-time portfolio dashboard, opportunity feed, P&L tracking, worker health monitoring, and configuration panel.' },
  { icon: '🔑', title: 'Early access invite system', body: 'Onboard paying customers manually with invite codes and a dedicated admin panel. No self-serve noise.' }
];
