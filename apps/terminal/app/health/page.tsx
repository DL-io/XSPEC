'use client';

import { useEffect, useState } from 'react';
import { apiFetch, tenantId } from '../api-client';

interface Worker {
  worker: string;
  status: 'ok' | 'error';
  lastHeartbeatAt: string;
  lastSuccessAt?: string;
  lastError?: string;
}

interface Dependency {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}

const ICONS: Record<string, string> = {
  mysql: '🗄', database: '🗄', db: '🗄',
  redis: '⚡', cache: '⚡',
  openai: '🤖', anthropic: '🤖', llm: '🤖',
  tavily: '🔍'
};

function icon(name: string) {
  const l = name.toLowerCase();
  for (const [k, v] of Object.entries(ICONS)) if (l.includes(k)) return v;
  return '🔗';
}

function ago(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export default function SystemHealth() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [deps, setDeps] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`/api/health?tenantId=${tenantId}`);
        if (res.ok) {
          const d = await res.json();
          setWorkers(d.workers ?? []);
          setDeps(d.dependencies ?? []);
        }
      } catch { /* keep stale */ } finally {
        setLoading(false);
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const okWorkers = workers.filter((w) => w.status === 'ok').length;
  const okDeps = deps.filter((d) => d.status === 'ok').length;

  if (loading) return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 1280 }}>
      <div className="pageHeader">
        <span className="pageTitle">System Health</span>
        <span className="pageSubtitle">Live status · refreshes every 5s</span>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'Workers Online', value: `${okWorkers}/${workers.length}`, ok: okWorkers === workers.length && workers.length > 0 },
          { label: 'Worker Errors', value: workers.length - okWorkers, ok: workers.length - okWorkers === 0 },
          { label: 'Deps Online', value: `${okDeps}/${deps.length}`, ok: okDeps === deps.length && deps.length > 0 },
          { label: 'Dep Errors', value: deps.length - okDeps, ok: deps.length - okDeps === 0 },
        ].map((s) => (
          <div key={s.label} className="statCard">
            <div className="statLabel">{s.label}</div>
            <div className={`statValue ${s.ok ? 'positive' : Number(String(s.value).replace(/\/.*/, '')) < Number(String(s.value).replace(/.*\//, '')) ? 'negative' : 'positive'}`} style={{ fontSize: 28 }}>
              {String(s.value)}
            </div>
          </div>
        ))}
      </div>

      {/* Dependency grid */}
      <div className="panel">
        <div className="panelHeader"><span className="panelTitle">Infrastructure Dependencies</span></div>
        {deps.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12 }}>
            {deps.map((d) => (
              <div key={d.name} style={{
                padding: 16,
                borderRadius: 10,
                background: 'var(--surface-2)',
                border: `1px solid ${d.status === 'ok' ? 'var(--green-border)' : 'var(--red-border)'}`,
                borderTop: `3px solid ${d.status === 'ok' ? 'var(--green)' : 'var(--red)'}`
              }}>
                <div style={{ fontSize: 22, marginBottom: 6 }}>{icon(d.name)}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{d.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className={`badge ${d.status === 'ok' ? 'green' : 'red'}`} style={{ fontSize: 10 }}>
                    {d.status === 'ok' ? '✓ OK' : '✗ ERROR'}
                  </span>
                  {typeof d.latencyMs === 'number' && (
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: d.latencyMs < 100 ? 'var(--green)' : d.latencyMs < 300 ? 'var(--amber)' : 'var(--red)' }}>
                      {d.latencyMs}ms
                    </span>
                  )}
                </div>
                {d.error && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>{d.error}</div>}
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>checked {ago(d.checkedAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
            No dependency checks reported yet
          </div>
        )}
      </div>

      {/* Worker grid */}
      <div className="panel">
        <div className="panelHeader"><span className="panelTitle">Workers</span></div>
        {workers.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12 }}>
            {workers.map((w) => (
              <div key={w.worker} style={{
                padding: 16,
                borderRadius: 10,
                background: 'var(--surface-2)',
                border: `1px solid ${w.status === 'ok' ? 'var(--green-border)' : 'var(--red-border)'}`
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`dot ${w.status === 'ok' ? 'green' : 'red'}`} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{w.worker.replace(/-worker$/, '')}</span>
                  </div>
                  <span className={`badge ${w.status === 'ok' ? 'green' : 'red'}`}>
                    {w.status === 'ok' ? 'ONLINE' : 'DOWN'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
                  <div>
                    <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>Heartbeat</div>
                    <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>{ago(w.lastHeartbeatAt)}</div>
                  </div>
                  {w.lastSuccessAt && (
                    <div>
                      <div style={{ color: 'var(--text-3)', marginBottom: 2 }}>Last Success</div>
                      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>{ago(w.lastSuccessAt)}</div>
                    </div>
                  )}
                </div>
                {w.lastError && (
                  <div style={{ marginTop: 8, fontSize: 11, color: 'var(--red)', borderTop: '1px solid var(--red-border)', paddingTop: 8 }}>
                    {w.lastError.slice(0, 80)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
            No worker heartbeats yet — workers start on first scan cycle
          </div>
        )}
      </div>
    </div>
  );
}
