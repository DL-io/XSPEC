'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch, tenantId } from '../../api-client';
import styles from '../operator.module.css';

type DecisionFilter = 'ALL' | 'APPROVE' | 'REJECT';
type DateRange = 'today' | '7d' | '30d';

interface ModelEstimate {
  modelId: string;
  probability: number;
  confidenceWeight: number;
  evidence?: string[];
}

interface DecisionAudit {
  id: string;
  marketId: string;
  scannerData?: { question?: string };
  modelEstimates: ModelEstimate[];
  ensembleOutput?: { ensembleProbability: number; ensembleConfidence: number };
  edgeCalculations?: { edge?: number; penalizedEdge?: number };
  riskDecision?: { approved: boolean; blockedBy?: string; reasons: string[] };
  finalOutcome: 'trade' | 'skip';
  createdAt: string;
}

export default function AuditExplorer() {
  const [audits, setAudits] = useState<DecisionAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [decision, setDecision] = useState<DecisionFilter>('ALL');
  const [dateRange, setDateRange] = useState<DateRange>('7d');
  const [minEdge, setMinEdge] = useState('0');

  useEffect(() => {
    const fetchAudits = async () => {
      try {
        const params = new URLSearchParams({ tenantId, limit: '100' });
        if (decision !== 'ALL') params.set('decision', decision);
        params.set('from', rangeStart(dateRange).toISOString());
        const res = await apiFetch(`/api/audits?${params.toString()}`);
        if (!res.ok) throw new Error('Failed to fetch audit records');
        const data = await res.json() as { audits?: DecisionAudit[] };
        setAudits(data.audits ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading audit records');
      } finally {
        setLoading(false);
      }
    };

    fetchAudits();
    const interval = setInterval(fetchAudits, 30_000);
    return () => clearInterval(interval);
  }, [decision, dateRange]);

  const filteredAudits = useMemo(() => {
    const threshold = Number(minEdge || 0) / 100;
    return audits.filter((audit) => Math.abs(audit.edgeCalculations?.penalizedEdge ?? audit.edgeCalculations?.edge ?? 0) >= threshold);
  }, [audits, minEdge]);

  if (loading) return <AuditSkeleton />;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.wideContainer}>
      <div className={styles.header}>
        <h1>Decision Audit Explorer</h1>
        <Link href="/" className={styles.backLink}>Back to Dashboard</Link>
      </div>

      <div className={styles.controls}>
        <label className={styles.label}>Decision</label>
        <select value={decision} onChange={(event) => setDecision(event.target.value as DecisionFilter)}>
          <option value="ALL">ALL</option>
          <option value="APPROVE">APPROVE</option>
          <option value="REJECT">REJECT</option>
        </select>
        <label className={styles.label}>Range</label>
        <select value={dateRange} onChange={(event) => setDateRange(event.target.value as DateRange)}>
          <option value="today">Today</option>
          <option value="7d">7d</option>
          <option value="30d">30d</option>
        </select>
        <label className={styles.label}>Min Edge %</label>
        <input type="number" min="0" step="0.1" value={minEdge} onChange={(event) => setMinEdge(event.target.value)} />
      </div>

      {filteredAudits.length === 0 ? (
        <div className={styles.emptyState}>Waiting for first scanner cycle — audit records will appear here as markets are evaluated.</div>
      ) : (
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Market Question</th>
                <th>Decision</th>
                <th>Edge</th>
                <th>Confidence</th>
                <th>Ensemble Probability</th>
              </tr>
            </thead>
            <tbody>
              {filteredAudits.map((audit) => {
                const approved = audit.finalOutcome === 'trade' && audit.riskDecision?.approved;
                const question = audit.scannerData?.question ?? audit.marketId;
                return (
                  <Fragment key={audit.id}>
                    <tr className={styles.clickable} onClick={() => setExpandedId(expandedId === audit.id ? null : audit.id)}>
                      <td className={styles.mono}>{new Date(audit.createdAt).toLocaleString()}</td>
                      <td>{truncate(question, 86)}</td>
                      <td><span className={`${styles.badge} ${approved ? styles.approved : styles.rejected}`}>{approved ? 'APPROVE' : 'REJECT'}</span></td>
                      <td><EdgeCell value={audit.edgeCalculations?.penalizedEdge ?? audit.edgeCalculations?.edge} /></td>
                      <td>{percent(audit.ensembleOutput?.ensembleConfidence)}</td>
                      <td>{percent(audit.ensembleOutput?.ensembleProbability)}</td>
                    </tr>
                    {expandedId === audit.id && (
                      <tr>
                        <td colSpan={6}>
                          <div className={styles.detailPanel}>
                            <h2>{question}</h2>
                            <p className={styles.muted}>Market: <span className={styles.mono}>{audit.marketId}</span></p>
                            <table className={styles.table}>
                              <thead><tr><th>Model</th><th>Estimate</th><th>Weight</th></tr></thead>
                              <tbody>
                                {audit.modelEstimates.map((estimate) => (
                                  <tr key={estimate.modelId}>
                                    <td>{estimate.modelId}</td>
                                    <td>{percent(estimate.probability)}</td>
                                    <td>{percent(estimate.confidenceWeight)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <p className={styles.muted}>{audit.riskDecision?.reasons.join(' ') || 'No blocking risk reason recorded.'}</p>
                            <span className={`${styles.badge} ${approved ? styles.approved : styles.rejected}`}>
                              {approved ? 'Final Decision: APPROVE' : `Final Decision: REJECT${audit.riskDecision?.blockedBy ? ` - ${audit.riskDecision.blockedBy}` : ''}`}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonRow" />
      <div className="skeletonWide" />
    </div>
  );
}

function rangeStart(range: DateRange): Date {
  const now = new Date();
  if (range === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 86_400_000);
}

function percent(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'N/A';
}

function EdgeCell({ value }: { value: number | undefined }) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return <span className={styles.edgeNeutral}>N/A</span>;
  const pct = (value * 100).toFixed(1);
  if (value > 0) return <span className={styles.edgePositive}>+{pct}%</span>;
  if (value < 0) return <span className={styles.edgeNegative}>{pct}%</span>;
  return <span className={styles.edgeNeutral}>{pct}%</span>;
}

function truncate(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}
