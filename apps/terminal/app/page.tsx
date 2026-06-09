'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch, tenantId } from './api-client';
import styles from './mission-control.module.css';

interface OverviewData {
  safety: { killSwitchActive: boolean; killSwitchReason?: string; liveAuthorized: boolean };
  reconciliation: { severeMismatchOpen: boolean; incident?: { acknowledgedAt?: string } };
  portfolio: { equity: number; cash: number; totalExposure: number; dailyPnl: number; maxDrawdown: number; openOrderCount: number; positions: Position[] } | null;
  portfolioHistory: Array<{ equity: number; capturedAt: string }>;
  audits: Audit[];
  orders: unknown[];
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

export default function MissionControl() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsConfig, setNeedsConfig] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [overviewRes, signalsRes] = await Promise.all([
          apiFetch(`/api/overview?tenantId=${tenantId}`),
          apiFetch(`/api/signals?tenantId=${tenantId}`)
        ]);
        if (overviewRes.status === 401 || signalsRes.status === 401) {
          setNeedsConfig(true);
          return;
        }
        if (!overviewRes.ok) throw new Error(`Overview fetch failed: ${overviewRes.status}`);
        const [overviewData, signalsData] = await Promise.all([overviewRes.json(), signalsRes.json()]);
        setOverview(overviewData);
        setSignals(signalsData.signals ?? []);
      } catch {
        // keep showing data if we have it; only surface on first load
        if (!overview) setNeedsConfig(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <MissionControlSkeleton />;

  if (needsConfig) {
    return (
      <div className={styles.configScreen}>
        <div className={styles.configCard}>
          <div className={styles.configLogo}><span>X</span>SPEC</div>
          <h1 className={styles.configTitle}>Operator Terminal</h1>
          <p className={styles.configText}>
            The terminal requires an operator API key to connect to the backend. Add the following to your <code>.env</code> file and restart the dev server.
          </p>
          <div className={styles.configCode}>
            NEXT_PUBLIC_OPERATOR_API_KEY=your_key_here<br />
            NEXT_PUBLIC_TENANT_ID=system
          </div>
        </div>
      </div>
    );
  }

  if (!overview) return <MissionControlSkeleton />;

  const portfolio = overview.portfolio ?? { equity: 0, cash: 0, totalExposure: 0, dailyPnl: 0, maxDrawdown: 0, openOrderCount: 0, positions: [] };
  const equityHistory = (overview.portfolioHistory ?? []).map((s) => ({
    time: new Date(s.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    equity: s.equity
  }));
  const safety = overview.safety ?? { killSwitchActive: true, liveAuthorized: false };
  const reconciliation = overview.reconciliation ?? { severeMismatchOpen: false };

  const systemStatus = safety.killSwitchActive ? 'EMERGENCY' : reconciliation.severeMismatchOpen ? 'DEGRADED' : 'HEALTHY';
  const tradingMode = safety.liveAuthorized ? 'LIVE' : 'PAPER';
  const staleData = latestTimestamp(overview.audits ?? []) !== undefined &&
    Date.now() - latestTimestamp(overview.audits ?? [])! > 300_000;

  const pnlPositive = portfolio.dailyPnl >= 0;
  const pnlPrefix = pnlPositive ? '+' : '';

  return (
    <div className={styles.container}>
      {/* Hero stat bar */}
      <div className={styles.heroBar}>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Portfolio Equity</span>
          <span className={styles.heroValue}>${portfolio.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Daily P&amp;L</span>
          <span className={`${styles.heroValue} ${pnlPositive ? styles.positive : styles.negative}`}>
            {pnlPrefix}${Math.abs(portfolio.dailyPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>System Status</span>
          <div className={styles.heroBadges}>
            <span className={`${styles.heroBadge} ${systemStatus === 'HEALTHY' ? styles.healthy : systemStatus === 'DEGRADED' ? styles.degraded : styles.emergency}`}>
              <span className={styles.heroDot} />
              {systemStatus}
            </span>
          </div>
        </div>
        <div className={styles.heroStat}>
          <span className={styles.heroLabel}>Trading Mode</span>
          <div className={styles.heroBadges}>
            <span className={`${styles.heroBadge} ${tradingMode === 'LIVE' ? styles.live : styles.paper}`}>
              {tradingMode}
            </span>
            <span className={`${styles.heroBadge} ${safety.killSwitchActive ? styles.engaged : styles.clear}`}>
              {safety.killSwitchActive ? 'KILL' : 'CLEAR'}
            </span>
          </div>
        </div>
      </div>

      {staleData && (
        <Link href="/health" className={styles.staleBanner}>
          ⚠ Scanner data may be stale — last activity over 5 minutes ago. Check System Health.
        </Link>
      )}

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Equity Curve */}
        <div className={`${styles.panel} ${styles.equityCurve}`}>
          <h2>Equity Curve</h2>
          {equityHistory.length > 1 ? (
            <div className={styles.chartContainer}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={equityHistory}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8e2" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#8a8a84' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8a8a84' }} width={70} tickFormatter={(v) => `$${v.toLocaleString()}`} />
                  <Tooltip formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2 })}`, 'Equity']} />
                  <Line type="monotone" dataKey="equity" stroke="#ff6b35" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className={styles.emptyTimeline}>
              <strong>No equity history yet</strong>
              Waiting for first portfolio snapshot.
            </div>
          )}
        </div>

        {/* Opportunity Queue */}
        <div className={`${styles.panel} ${styles.opportunityQueue}`}>
          <h2>Opportunity Queue</h2>
          {signals.length > 0 ? (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Market</th>
                    <th>Score</th>
                    <th>Conf.</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.slice(0, 6).map((signal, i) => (
                    <tr key={i}>
                      <td><code>{signal.marketId.slice(0, 14)}…</code></td>
                      <td>
                        <span className={signal.opportunityScore > 0 ? styles.edgePositive : styles.edgeNeutral}>
                          {(signal.opportunityScore * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td>{(signal.confidence * 100).toFixed(1)}%</td>
                      <td>
                        <span className={`${styles.badge} ${signal.riskApproved ? styles.approved : styles.pending}`}>
                          {signal.riskApproved ? 'Ready' : 'Pending'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyTimeline}>
              <strong>Waiting for scanner</strong>
              Signals will appear here after the first scanner cycle completes.
            </div>
          )}
          <Link href="/opportunities" className={styles.linkButton}>View Full Queue →</Link>
        </div>

        {/* Active Portfolio */}
        <div className={`${styles.panel} ${styles.activePortfolio}`}>
          <h2>Active Positions</h2>
          {portfolio.positions && portfolio.positions.length > 0 ? (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Market</th><th>Side</th><th>Qty</th><th>Value</th></tr>
                </thead>
                <tbody>
                  {portfolio.positions.slice(0, 6).map((pos, i) => (
                    <tr key={i}>
                      <td><code>{pos.marketId?.slice(0, 14) ?? 'N/A'}…</code></td>
                      <td><span className={`${styles.badge} ${pos.side === 'yes' ? styles.long : styles.short}`}>{pos.side?.toUpperCase()}</span></td>
                      <td>{pos.quantity?.toFixed(2) ?? 0}</td>
                      <td className={pos.marketValue >= 0 ? styles.edgePositive : styles.edgeNegative}>
                        ${(pos.marketValue ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyTimeline}>
              <strong>No open positions</strong>
              Positions appear here once trades are executed.
            </div>
          )}
          <Link href="/portfolio" className={styles.linkButton}>View Portfolio →</Link>
        </div>

        {/* Live Activity Feed */}
        <div className={`${styles.panel} ${styles.activityFeed}`}>
          <h2>Recent Decisions</h2>
          {overview.audits && overview.audits.length > 0 ? (
            <div className={styles.timeline}>
              {overview.audits.slice(0, 6).map((audit, i) => {
                const question = audit.scannerData?.question ?? audit.marketId;
                const approved = audit.finalOutcome === 'trade' && audit.riskDecision?.approved;
                const edge = audit.edgeCalculations?.penalizedEdge ?? audit.edgeCalculations?.edge;
                return (
                  <div key={i} className={styles.timelineItem}>
                    <div className={styles.timelineBullet} />
                    <div className={styles.timelineContent}>
                      <div className={styles.timelineTime}>{new Date(audit.createdAt).toLocaleTimeString()}</div>
                      <div className={styles.timelineEvent}>{truncate(question, 52)}</div>
                      <div>
                        <span className={`${styles.badge} ${approved ? styles.approved : styles.pending}`}>
                          {approved ? 'TRADE' : 'SKIP'}
                        </span>
                        {typeof edge === 'number' && (
                          <span className={edge > 0 ? styles.edgePositive : styles.edgeNeutral} style={{ fontSize: '11px', marginLeft: '6px' }}>
                            edge {(edge * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyTimeline}>
              <strong>Waiting for first scanner cycle</strong>
              Decisions will appear here as markets are evaluated.
            </div>
          )}
          <Link href="/audit" className={styles.linkButton}>Full Audit Trail →</Link>
        </div>
      </div>

      {/* Bottom Grid */}
      <div className={styles.bottomGrid}>
        <div className={`${styles.panel} ${styles.riskSummary}`}>
          <h2>Risk Fortress</h2>
          <div className={styles.gatesList}>
            {!reconciliation.severeMismatchOpen && !safety.killSwitchActive ? (
              <div className={styles.gate}>
                <span className={styles.gateStatus}>✓</span>
                <span>All safety gates clear</span>
              </div>
            ) : null}
            {reconciliation.severeMismatchOpen && (
              <div className={`${styles.gate} ${styles.failed}`}>
                <span className={styles.gateStatus}>✗</span>
                <span>Reconciliation gate blocked</span>
              </div>
            )}
            {safety.killSwitchActive && (
              <div className={`${styles.gate} ${styles.failed}`}>
                <span className={styles.gateStatus}>✗</span>
                <span>Kill switch engaged</span>
              </div>
            )}
          </div>
          <Link href="/configuration" className={styles.linkButton}>Configure Gates →</Link>
        </div>

        <div className={`${styles.panel} ${styles.reconciliationSummary}`}>
          <h2>Reconciliation</h2>
          <div className={`${styles.reconciliationStatus} ${reconciliation.severeMismatchOpen ? styles.warning : styles.healthy}`}>
            {reconciliation.severeMismatchOpen ? '⚠ MISMATCH OPEN' : '✓ MATCHED'}
          </div>
          {reconciliation.incident && (
            <div className={styles.incidentInfo}>
              <p><strong>Issue:</strong> Venue and local state divergence</p>
              <p><strong>Status:</strong> {reconciliation.incident.acknowledgedAt ? 'Acknowledged' : 'Pending Review'}</p>
            </div>
          )}
          <Link href="/reconciliation" className={styles.linkButton}>View Details →</Link>
        </div>

        <div className={`${styles.panel} ${styles.workerHealth}`}>
          <h2>Worker Health</h2>
          <div className={styles.workersList}>
            {overview.workers && overview.workers.length > 0 ? (
              overview.workers.slice(0, 5).map((worker) => (
                <div key={worker.worker} className={`${styles.workerItem} ${worker.status === 'ok' ? styles.healthy : styles.error}`}>
                  <span className={styles.workerDot} />
                  <span>{worker.worker.replace('-worker', '')}</span>
                </div>
              ))
            ) : (
              <div className={styles.empty}>No worker heartbeats yet</div>
            )}
          </div>
          <Link href="/health" className={styles.linkButton}>Full Health Report →</Link>
        </div>
      </div>
    </div>
  );
}

function MissionControlSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );
}

function latestTimestamp(audits: Array<{ createdAt?: string | Date }>): number | undefined {
  const times = audits
    .map((a) => a.createdAt ? new Date(a.createdAt).getTime() : Number.NaN)
    .filter(Number.isFinite);
  return times.length ? Math.max(...times) : undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
