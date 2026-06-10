'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { apiFetch, tenantId } from './api-client';

interface OverviewData {
  safety: { killSwitchActive: boolean; killSwitchReason?: string; liveAuthorized: boolean };
  reconciliation: { severeMismatchOpen: boolean; incident?: { acknowledgedAt?: string } };
  portfolio: { equity: number; cash: number; totalExposure: number; dailyPnl: number; maxDrawdown: number; openOrderCount: number; positions: Position[] } | null;
  portfolioHistory: Array<{ equity: number; capturedAt: string }>;
  audits: Audit[];
  orders: Order[];
  workers: Worker[];
}

interface Audit {
  id: string;
  marketId: string;
  scannerData?: { question?: string };
  ensembleOutput?: { ensembleProbability: number; ensembleConfidence: number };
  edgeCalculations?: { edge?: number; penalizedEdge?: number };
  riskDecision?: { approved: boolean };
  finalOutcome: 'trade' | 'skip';
  createdAt: string;
}

interface Order {
  id: string;
  marketId: string;
  side: string;
  quantity: number;
  limitPrice: number;
  state: string;
  createdAt: string;
}

interface Position {
  marketId: string;
  side: string;
  quantity: number;
  marketValue: number;
}

interface Worker {
  worker: string;
  status: 'ok' | 'error';
}

interface Signal {
  marketId: string;
  probability: number;
  uncertainty: number;
  confidence: number;
  finalOutcome: string;
  riskApproved: boolean;
  opportunityScore: number;
  createdAt: string;
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(false);
  const [emergencyModal, setEmergencyModal] = useState(false);
  const [safetyPending, setSafetyPending] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, signalsRes] = await Promise.all([
          apiFetch(`/api/overview?tenantId=${tenantId}`),
          apiFetch(`/api/signals?tenantId=${tenantId}`)
        ]);
        if (overviewRes.status === 401) { setNeedsConfig(true); setLoading(false); return; }
        if (!overviewRes.ok) throw new Error();
        const [overviewData, signalsData] = await Promise.all([overviewRes.json(), signalsRes.json()]);
        setOverview(overviewData);
        setSignals(signalsData.signals ?? []);
      } catch { /* keep stale data on error */ } finally {
        setLoading(false);
      }
    };
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, []);

  async function patchSafety(patch: Record<string, unknown>) {
    setSafetyPending(true);
    try {
      await apiFetch('/api/safety', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tenantId, ...patch }) });
      const res = await apiFetch(`/api/overview?tenantId=${tenantId}`);
      if (res.ok) setOverview(await res.json());
    } catch { /* show stale */ } finally {
      setSafetyPending(false);
    }
  }

  if (loading) return <DashboardSkeleton />;

  if (needsConfig) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '80vh' }}>
        <div className="panel" style={{ maxWidth: 480, textAlign: 'center', padding: 36 }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 32, fontWeight: 700, color: 'var(--accent)', marginBottom: 12 }}>
            <em style={{ fontStyle: 'normal' }}>X</em>SPEC
          </div>
          <h2 style={{ margin: '0 0 10px', fontSize: 18 }}>API Key Required</h2>
          <p style={{ color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 20 }}>
            Add the following to your <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>.env</code> file and restart.
          </p>
          <pre style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, textAlign: 'left', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-2)' }}>
            {`NEXT_PUBLIC_OPERATOR_API_KEY=your_key\nNEXT_PUBLIC_TENANT_ID=system`}
          </pre>
        </div>
      </div>
    );
  }

  if (!overview) return <DashboardSkeleton />;

  const portfolio = overview.portfolio ?? { equity: 0, cash: 0, totalExposure: 0, dailyPnl: 0, maxDrawdown: 0, openOrderCount: 0, positions: [] };
  const safety = overview.safety ?? { killSwitchActive: true, liveAuthorized: false };
  const recon = overview.reconciliation ?? { severeMismatchOpen: false };
  const equityHistory = (overview.portfolioHistory ?? []).map((s) => ({
    time: new Date(s.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    equity: parseFloat(s.equity.toFixed(2))
  }));

  const mode = safety.killSwitchActive ? 'EMERGENCY' : safety.liveAuthorized ? 'LIVE' : 'PAPER';
  const modeColor = mode === 'EMERGENCY' ? 'var(--red)' : mode === 'LIVE' ? 'var(--green)' : 'var(--blue)';
  const pnlPos = portfolio.dailyPnl >= 0;

  return (
    <div style={{ display: 'grid', gap: 18, maxWidth: 1380 }}>
      {/* Hero stat bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        <div className="statCard">
          <div className="statLabel">Portfolio Equity</div>
          <div className="statValue">${fmt(portfolio.equity)}</div>
          <div className="statSub">{fmt(portfolio.cash)} cash · {portfolio.positions.length} positions</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Daily P&amp;L</div>
          <div className={`statValue ${pnlPos ? 'positive' : 'negative'}`}>
            {pnlPos ? '+' : '−'}${fmt(Math.abs(portfolio.dailyPnl))}
          </div>
          <div className="statSub">Max drawdown {(portfolio.maxDrawdown * 100).toFixed(2)}%</div>
        </div>
        <div className="statCard">
          <div className="statLabel">System Status</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span className={`dot ${recon.severeMismatchOpen || safety.killSwitchActive ? 'red' : 'green'}`} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700 }}>
              {safety.killSwitchActive ? 'EMERGENCY' : recon.severeMismatchOpen ? 'DEGRADED' : 'HEALTHY'}
            </span>
          </div>
          <div className="statSub">{overview.workers?.filter(w => w.status === 'ok').length ?? 0} workers online</div>
        </div>
        <div className="statCard">
          <div className="statLabel">Trading Mode</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span className={`dot ${mode === 'EMERGENCY' ? 'red' : mode === 'LIVE' ? 'green' : 'blue'}`} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 700, color: modeColor }}>{mode}</span>
          </div>
          <div className="statSub">{portfolio.openOrderCount} open orders</div>
        </div>
      </div>

      {/* Control strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {safety.killSwitchActive ? (
          <button className="success" disabled={safetyPending} onClick={() => patchSafety({ killSwitch: { active: false, reason: 'operator cleared' } })}>
            Reset Kill Switch
          </button>
        ) : (
          <button disabled={safetyPending} onClick={() => patchSafety({ killSwitch: { active: true, reason: 'operator pause' } })}>
            Pause Trading
          </button>
        )}
        <button className="danger" disabled={safetyPending} onClick={() => setEmergencyModal(true)}>
          Emergency Stop
        </button>
        <Link href="/configuration"><button>Risk Settings</button></Link>
        <Link href="/health"><button>System Health</button></Link>
      </div>

      {/* Main panels row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 18 }}>
        {/* Equity curve */}
        <div className="panel">
          <div className="panelHeader">
            <span className="panelTitle">Equity Curve</span>
            {equityHistory.length > 0 && <span className="badge orange">{equityHistory.length} snapshots</span>}
          </div>
          {equityHistory.length > 1 ? (
            <div className="chartWrap">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={equityHistory}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#5a5a56' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#5a5a56' }} width={72} tickFormatter={(v) => `$${v.toLocaleString()}`} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#161614', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9a9a94' }}
                    formatter={(v: number) => [`$${fmt(v)}`, 'Equity']}
                  />
                  <Area type="monotone" dataKey="equity" stroke="#f97316" strokeWidth={2} fill="url(#equityGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState msg="No equity history yet — waiting for first portfolio snapshot" />
          )}
        </div>

        {/* Worker health */}
        <div className="panel">
          <div className="panelHeader">
            <span className="panelTitle">Workers</span>
          </div>
          {overview.workers && overview.workers.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {overview.workers.map((w) => (
                <div key={w.worker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`dot ${w.status === 'ok' ? 'green' : 'red'}`} />
                    <span style={{ fontSize: 12.5 }}>{w.worker.replace('-worker', '')}</span>
                  </div>
                  <span className={`badge ${w.status === 'ok' ? 'green' : 'red'}`}>{w.status === 'ok' ? 'ONLINE' : 'ERROR'}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState msg="No worker heartbeats yet" />
          )}
        </div>
      </div>

      {/* Open orders + recent signals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        {/* Open orders */}
        <div className="panel">
          <div className="panelHeader">
            <span className="panelTitle">Open Orders</span>
            {overview.orders?.length > 0 && <span className="badge blue">{overview.orders.length}</span>}
          </div>
          {overview.orders?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Qty</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.orders.slice(0, 8).map((o) => (
                    <tr key={o.id}>
                      <td><span className="mono muted">{o.marketId.slice(0, 12)}…</span></td>
                      <td><span className={`badge ${o.side === 'yes' ? 'green' : 'amber'}`}>{o.side.toUpperCase()}</span></td>
                      <td className="mono">{(o.limitPrice * 100).toFixed(1)}¢</td>
                      <td className="mono">{o.quantity.toFixed(2)}</td>
                      <td><span className="muted" style={{ fontSize: 11 }}>{o.state}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState msg="No open orders" />
          )}
        </div>

        {/* Recent signals */}
        <div className="panel">
          <div className="panelHeader">
            <span className="panelTitle">Recent Signals</span>
            {signals.length > 0 && <Link href="/opportunities" style={{ fontSize: 11, color: 'var(--accent)' }}>View all →</Link>}
          </div>
          {signals.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Prob.</th>
                    <th>Edge</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.slice(0, 8).map((s, i) => (
                    <tr key={i}>
                      <td><span className="mono muted">{s.marketId.slice(0, 12)}…</span></td>
                      <td className="mono">{(s.probability * 100).toFixed(1)}%</td>
                      <td>
                        <span className={s.opportunityScore > 0 ? 'positive' : 'muted'} style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                          {s.opportunityScore > 0 ? '+' : ''}{(s.opportunityScore * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${s.finalOutcome === 'trade' ? 'green' : 'amber'}`}>
                          {s.finalOutcome === 'trade' ? 'TRADE' : 'SKIP'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState msg="Waiting for first scanner cycle" />
          )}
        </div>
      </div>

      {/* Emergency Stop modal */}
      {emergencyModal && (
        <div className="modalOverlay" onClick={() => setEmergencyModal(false)}>
          <div className="modalBox" onClick={(e) => e.stopPropagation()}>
            <div className="modalTitle" style={{ color: 'var(--red)' }}>Emergency Stop</div>
            <div className="modalBody">
              This will immediately engage the kill switch and halt all new orders.
              In-flight orders will not be cancelled automatically — check open orders and cancel manually if needed.
            </div>
            <div className="modalActions">
              <button onClick={() => setEmergencyModal(false)}>Cancel</button>
              <button className="danger" onClick={async () => {
                setEmergencyModal(false);
                await patchSafety({ killSwitch: { active: true, reason: 'EMERGENCY_STOP' } });
              }}>
                Confirm Emergency Stop
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
      {msg}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonRow" style={{ height: 40 }} />
      <div className="skeletonWide" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /></div>
    </div>
  );
}
