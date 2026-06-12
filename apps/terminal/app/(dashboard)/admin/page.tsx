'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '../../api-client';

interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  status: string;
  createdAt: string;
  role?: string;
}

interface InviteCode {
  id: string;
  code: string;
  createdBy: string;
  usedBy?: string | null;
  usedAt?: string | null;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

interface WaitlistEntry {
  id: string;
  email: string;
  name: string;
  message: string;
  contacted: boolean;
  createdAt: string;
}

type Tab = 'users' | 'invite-codes' | 'waitlist';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [codes, setCodes] = useState<InviteCode[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadTab(tab);
  }, [tab]);

  async function loadTab(t: Tab) {
    setLoading(true);
    try {
      if (t === 'users') {
        const res = await apiFetch('/api/admin/users');
        if (res.ok) setUsers((await res.json()).users);
      } else if (t === 'invite-codes') {
        const res = await apiFetch('/api/admin/invite-codes');
        if (res.ok) setCodes((await res.json()).codes);
      } else {
        const res = await apiFetch('/api/admin/waitlist');
        if (res.ok) setWaitlist((await res.json()).entries);
      }
    } finally {
      setLoading(false);
    }
  }

  async function setUserStatus(userId: string, status: string) {
    await apiFetch('/api/admin/users', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, status }) });
    loadTab('users');
  }

  async function generateCode() {
    setGenerating(true);
    try {
      await apiFetch('/api/admin/invite-codes', { method: 'POST' });
      loadTab('invite-codes');
    } finally {
      setGenerating(false);
    }
  }

  async function deactivateCode(id: string) {
    await apiFetch(`/api/admin/invite-codes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    loadTab('invite-codes');
  }

  async function markContacted(id: string) {
    await apiFetch('/api/admin/waitlist', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) });
    loadTab('waitlist');
  }

  const fmtDate = (s: string | null | undefined) => s ? new Date(s).toLocaleDateString() : '—';

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Admin</h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13 }}>User management, invite codes, and waitlist — owner access only.</p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {(['users', 'invite-codes', 'waitlist'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '8px 16px', fontSize: 13,
              color: tab === t ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, fontFamily: 'var(--mono)', textTransform: 'capitalize'
            }}
          >
            {t.replace('-', ' ')}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-2)', fontSize: 13, padding: 24 }}>Loading…</div>
      ) : (
        <>
          {tab === 'users' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  {['Email', 'Name', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', color: 'var(--text-2)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{u.email}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{u.displayName}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{u.role ?? '—'}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: u.status === 'active' ? 'rgba(34,197,94,0.15)' : u.status === 'suspended' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: u.status === 'active' ? 'var(--green)' : u.status === 'suspended' ? 'var(--red)' : 'var(--amber)' }}>
                        {u.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{fmtDate(u.createdAt)}</td>
                    <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                      {u.status !== 'active' && <button onClick={() => setUserStatus(u.id, 'active')} style={btnStyle('var(--green)')}>Activate</button>}
                      {u.status !== 'suspended' && <button onClick={() => setUserStatus(u.id, 'suspended')} style={btnStyle('var(--red)')}>Suspend</button>}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, color: 'var(--text-2)', textAlign: 'center' }}>No users yet.</td></tr>
                )}
              </tbody>
            </table>
          )}

          {tab === 'invite-codes' && (
            <>
              <div style={{ marginBottom: 16 }}>
                <button onClick={generateCode} disabled={generating} style={{ ...btnStyle('var(--accent)'), padding: '8px 16px', fontSize: 13 }}>
                  {generating ? 'Generating…' : '+ Generate Code'}
                </button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                    {['Code', 'Created By', 'Used By', 'Expires', 'Status', 'Actions'].map((h) => (
                      <th key={h} style={{ padding: '8px 12px', color: 'var(--text-2)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {codes.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 12px', color: 'var(--accent)', fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>{c.code}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{c.createdBy}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{c.usedBy ?? '—'}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{fmtDate(c.expiresAt)}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(154,154,148,0.15)', color: c.isActive ? 'var(--green)' : 'var(--text-2)' }}>
                          {c.isActive ? 'active' : c.usedBy ? 'used' : 'expired'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {c.isActive && !c.usedBy && <button onClick={() => deactivateCode(c.id)} style={btnStyle('var(--red)')}>Deactivate</button>}
                      </td>
                    </tr>
                  ))}
                  {codes.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 24, color: 'var(--text-2)', textAlign: 'center' }}>No invite codes yet. Generate one above.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {tab === 'waitlist' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                  {['Name', 'Email', 'Message', 'Requested', 'Contacted', 'Actions'].map((h) => (
                    <th key={h} style={{ padding: '8px 12px', color: 'var(--text-2)', fontWeight: 500 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {waitlist.map((e) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{e.name}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{e.email}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-2)', maxWidth: 320, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.message}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text-2)' }}>{fmtDate(e.createdAt)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: e.contacted ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', color: e.contacted ? 'var(--green)' : 'var(--amber)' }}>
                        {e.contacted ? 'yes' : 'pending'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {!e.contacted && <button onClick={() => markContacted(e.id)} style={btnStyle('var(--green)')}>Mark Contacted</button>}
                    </td>
                  </tr>
                ))}
                {waitlist.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 24, color: 'var(--text-2)', textAlign: 'center' }}>No waitlist entries yet.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function btnStyle(color: string): React.CSSProperties {
  return {
    background: 'none', border: `1px solid ${color}`, borderRadius: 4, color,
    cursor: 'pointer', fontSize: 11, padding: '4px 10px', fontFamily: 'var(--mono)'
  };
}
