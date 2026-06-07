'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import styles from './mission-control.module.css';

interface OverviewData {
  safety: any;
  reconciliation: any;
  portfolio: any;
  portfolioHistory: Array<{ equity: number; capturedAt: string }>;
  audits: any[];
  orders: any[];
  workers: any[];
}

interface Signal {
  marketId: string;
  probability: number;
  uncertainty: number;
  confidence: number;
  finalOutcome: string;
  riskApproved: boolean;
  opportunityScore: number;
  createdAt: Date;
}

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';

export default function MissionControl() {
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [overviewRes, signalsRes] = await Promise.all([
          fetch(`/api/overview?tenantId=${tenantId}`),
          fetch(`/api/signals?tenantId=${tenantId}`)
        ]);

        if (!overviewRes.ok || !signalsRes.ok) throw new Error('Failed to fetch data');

        const [overviewData, signalsData] = await Promise.all([
          overviewRes.json(),
          signalsRes.json()
        ]);

        setOverview(overviewData);
        setSignals(signalsData.signals || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5s
    return () => clearInterval(interval);
  }, []);

  if (loading) return <MissionControlSkeleton />; // HARDENED: first dashboard fetch shows a structured skeleton instead of a blank/text-only load.
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!overview) return <div className={styles.empty}>No data available</div>;

  const portfolio = overview.portfolio || { equity: 0, cash: 0, totalExposure: 0, dailyPnl: 0, maxDrawdown: 0, openOrderCount: 0, positions: [] };
  const equityHistory = (overview.portfolioHistory || []).map((snapshot) => ({
    time: new Date(snapshot.capturedAt).toLocaleTimeString(),
    equity: snapshot.equity
  }));
  const safety = overview.safety || { killSwitchActive: true, liveAuthorized: false };
  const reconciliation = overview.reconciliation || { severeMismatchOpen: false };

  const systemStatus = safety.killSwitchActive ? 'EMERGENCY' : reconciliation.severeMismatchOpen ? 'DEGRADED' : 'HEALTHY';
  const tradingMode = safety.liveAuthorized ? 'LIVE' : 'PAPER';
  const latestAuditAt = latestTimestamp(overview.audits ?? []);
  const staleData = latestAuditAt !== undefined && Date.now() - latestAuditAt > 300_000; // HARDENED: stale scanner output is surfaced before operators act on old data.

  return (
    <div className={styles.container}>
      {staleData && (
        <Link href="/health" className={styles.staleBanner}>⚠ Data may be stale — scanner worker may be inactive. Check System Health.</Link>
      )}
      {/* Command Bar */}
      <div className={styles.commandBar}>
        <div className={styles.commandSection}>
          <div className={styles.metric}>
            <span className={styles.label}>Portfolio Equity</span>
            <span className={styles.value}>${portfolio.equity?.toFixed(2) || '0.00'}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.label}>Daily P&L</span>
            <span className={`${styles.value} ${portfolio.dailyPnl >= 0 ? styles.positive : styles.negative}`}>
              {portfolio.dailyPnl >= 0 ? '+' : ''}
              ${portfolio.dailyPnl?.toFixed(2) || '0.00'}
            </span>
          </div>
          <div className={styles.metric}>
            <span className={styles.label}>Open Exposure</span>
            <span className={styles.value}>${portfolio.totalExposure?.toFixed(2) || '0.00'}</span>
          </div>
          <div className={styles.metric}>
            <span className={styles.label}>Open Positions</span>
            <span className={styles.value}>{portfolio.openOrderCount || overview.orders?.length || 0}</span>
          </div>
        </div>

        <div className={styles.commandSection}>
          <div className={`${styles.status} ${styles[`status-${systemStatus.toLowerCase()}`]}`}>
            {systemStatus}
          </div>
          <div className={styles.mode}>
            {tradingMode}
          </div>
          <div className={`${styles.killSwitch} ${safety.killSwitchActive ? styles.active : ''}`}>
            {safety.killSwitchActive ? 'ENGAGED' : 'CLEAR'}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className={styles.mainGrid}>
        {/* Equity Curve */}
        <div className={`${styles.panel} ${styles.equityCurve}`}>
          <h2>Equity Curve</h2>
          <div className={styles.chartContainer}>
            {equityHistory.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={equityHistory}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="equity" stroke="#ff6b35" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className={styles.empty}>No portfolio snapshots available</div>
            )}
          </div>
        </div>

        {/* Opportunity Queue */}
        <div className={`${styles.panel} ${styles.opportunityQueue}`}>
          <h2>Opportunity Queue</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Edge</th>
                  <th>Confidence</th>
                  <th>Spread</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {signals.slice(0, 5).map((signal, i) => (
                  <tr key={i}>
                    <td>
                      <code>{signal.marketId.slice(0, 12)}...</code>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${signal.opportunityScore > 0.5 ? styles.high : ''}`}>
                        {(signal.opportunityScore * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>{(signal.confidence * 100).toFixed(1)}%</td>
                    <td>{(signal.uncertainty * 100).toFixed(1)}%</td>
                    <td>
                      <span className={`${styles.badge} ${signal.riskApproved ? styles.approved : styles.pending}`}>
                        {signal.riskApproved ? 'Ready' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {signals.length === 0 && <div className={styles.empty}>No opportunities detected</div>}
          </div>
          <Link href="/opportunities" className={styles.linkButton}>
            View Full Queue →
          </Link>
        </div>

        {/* Active Portfolio */}
        <div className={`${styles.panel} ${styles.activePortfolio}`}>
          <h2>Active Portfolio</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Market</th>
                  <th>Side</th>
                  <th>Quantity</th>
                  <th>P&L</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.positions?.slice(0, 5).map((pos: any, i: number) => (
                  <tr key={i}>
                    <td><code>{pos.marketId?.slice(0, 12) || 'N/A'}...</code></td>
                    <td><span className={`${styles.badge} ${pos.side === 'YES' ? styles.long : styles.short}`}>{pos.side}</span></td>
                    <td>{pos.quantity?.toFixed(2) || 0}</td>
                    <td className={pos.marketValue >= 0 ? styles.positive : styles.negative}>
                      ${(pos.marketValue || 0).toFixed(2)}
                    </td>
                    <td>
                      <span className={`${styles.riskLevel} ${styles.medium}`}>●</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {portfolio.positions?.length === 0 && <div className={styles.empty}>No open positions</div>}
          </div>
          <Link href="/portfolio" className={styles.linkButton}>
            View Portfolio →
          </Link>
        </div>

        {/* Live Activity Feed */}
        <div className={`${styles.panel} ${styles.activityFeed}`}>
          <h2>Live Activity</h2>
          <div className={styles.timeline}>
            {overview.audits?.slice(0, 5).map((audit: any, i: number) => (
              <div key={i} className={styles.timelineItem}>
                <div className={styles.timelineBullet} />
                <div className={styles.timelineContent}>
                  <div className={styles.timelineTime}>{new Date(audit.createdAt).toLocaleTimeString()}</div>
                  <div className={styles.timelineEvent}>{audit.finalOutcome === 'trade' ? 'Trade Executed' : 'Decision Made'}</div>
                </div>
              </div>
            ))}
          </div>
          <Link href="/audit" className={styles.linkButton}>
            Full Audit Trail →
          </Link>
        </div>
      </div>

      {/* Risk & Reconciliation Summary */}
      <div className={styles.bottomGrid}>
        {/* Risk Fortress Summary */}
        <div className={`${styles.panel} ${styles.riskSummary}`}>
          <h2>Risk Fortress</h2>
          <div className={styles.gatesList}>
            {!reconciliation.severeMismatchOpen && !safety.killSwitchActive && (
              <div className={styles.gate}>
                <span className={styles.gateStatus}>✓</span>
                <span>Safety Gates Clear</span>
              </div>
            )}
            {reconciliation.severeMismatchOpen && (
              <div className={`${styles.gate} ${styles.failed}`}>
                <span className={styles.gateStatus}>✗</span>
                <span>Reconciliation Gate</span>
              </div>
            )}
            {safety.killSwitchActive && (
              <div className={`${styles.gate} ${styles.failed}`}>
                <span className={styles.gateStatus}>✗</span>
                <span>Kill Switch Gate</span>
              </div>
            )}
          </div>
          <Link href="/configuration" className={styles.linkButton}>
            Configure Gates →
          </Link>
        </div>

        {/* Reconciliation Center */}
        <div className={`${styles.panel} ${styles.reconciliationSummary}`}>
          <h2>Reconciliation Status</h2>
          <div className={`${styles.reconciliationStatus} ${reconciliation.severeMismatchOpen ? styles.warning : styles.healthy}`}>
            {reconciliation.severeMismatchOpen ? 'SEVERE MISMATCH OPEN' : 'MATCHED'}
          </div>
          {reconciliation.incident && (
            <div className={styles.incidentInfo}>
              <p><strong>Issue:</strong> Venue and local state divergence detected</p>
              <p><strong>Status:</strong> {reconciliation.incident.acknowledgedAt ? 'Acknowledged' : 'Pending Operator Review'}</p>
            </div>
          )}
          <Link href="/reconciliation" className={styles.linkButton}>
            View Details →
          </Link>
        </div>

        {/* Worker Health */}
        <div className={`${styles.panel} ${styles.workerHealth}`}>
          <h2>Worker Health</h2>
          <div className={styles.workersList}>
            {overview.workers?.slice(0, 4).map((worker: any) => (
              <div key={worker.worker} className={`${styles.workerItem} ${worker.status === 'ok' ? styles.healthy : styles.error}`}>
                <span className={styles.workerDot}></span>
                <span>{worker.worker}</span>
              </div>
            ))}
          </div>
          <Link href="/health" className={styles.linkButton}>
            Full Health Report →
          </Link>
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
    .map((audit) => audit.createdAt ? new Date(audit.createdAt).getTime() : Number.NaN)
    .filter((time) => Number.isFinite(time));
  return times.length ? Math.max(...times) : undefined;
}
