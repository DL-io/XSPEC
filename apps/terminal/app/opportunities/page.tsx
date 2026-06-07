'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './opportunities.module.css';

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

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';

export default function OpportunitiesPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'edge' | 'confidence' | 'recent'>('edge');

  useEffect(() => {
    const fetchSignals = async () => {
      try {
        const res = await fetch(`/api/signals?tenantId=${tenantId}`);
        if (!res.ok) throw new Error('Failed to fetch signals');
        const data = await res.json();
        setSignals(data.signals || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading opportunities');
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, []);

  const sortedSignals = [...signals].sort((a, b) => {
    if (sortBy === 'edge') return b.opportunityScore - a.opportunityScore;
    if (sortBy === 'confidence') return b.confidence - a.confidence;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  if (loading) return <PageSkeleton />; // HARDENED: first opportunity fetch shows a skeleton state.
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Opportunity Feed</h1>
        <Link href="/" className={styles.backLink}>← Back to Mission Control</Link>
      </div>

      <div className={styles.controls}>
        <div className={styles.sortButtons}>
          <button className={sortBy === 'edge' ? styles.active : ''} onClick={() => setSortBy('edge')}>
            Highest Edge
          </button>
          <button className={sortBy === 'confidence' ? styles.active : ''} onClick={() => setSortBy('confidence')}>
            Highest Confidence
          </button>
          <button className={sortBy === 'recent' ? styles.active : ''} onClick={() => setSortBy('recent')}>
            Most Recent
          </button>
        </div>
      </div>

      {sortedSignals.length > 0 ? (
        <div className={styles.signalsList}>
          {sortedSignals.map((signal, i) => (
            <div key={i} className={`${styles.signalCard} ${!signal.riskApproved ? styles.pending : ''}`}>
              <div className={styles.cardHeader}>
                <div className={styles.marketId}>
                  <code>{signal.marketId}</code>
                </div>
                <div className={styles.cardStatus}>
                  {signal.riskApproved ? (
                    <span className={`${styles.badge} ${styles.approved}`}>Ready</span>
                  ) : (
                    <span className={`${styles.badge} ${styles.pending}`}>Pending Risk</span>
                  )}
                </div>
              </div>

              <div className={styles.cardMetrics}>
                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Opportunity Edge</span>
                  <div className={styles.metricValue}>
                    <span className={styles.percentage}>{(signal.opportunityScore * 100).toFixed(1)}%</span>
                    <div className={styles.metricBar}>
                      <div className={styles.metricFill} style={{ width: `${signal.opportunityScore * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Confidence</span>
                  <div className={styles.metricValue}>
                    <span className={styles.percentage}>{(signal.confidence * 100).toFixed(1)}%</span>
                    <div className={styles.metricBar}>
                      <div className={styles.metricFill} style={{ width: `${signal.confidence * 100}%` }} />
                    </div>
                  </div>
                </div>

                <div className={styles.metric}>
                  <span className={styles.metricLabel}>Uncertainty</span>
                  <div className={styles.metricValue}>
                    <span className={styles.percentage}>{(signal.uncertainty * 100).toFixed(1)}%</span>
                    <div className={styles.metricBar}>
                      <div className={styles.metricFill} style={{ width: `${signal.uncertainty * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.cardFooter}>
                <span className={styles.timestamp}>{new Date(signal.createdAt).toLocaleTimeString()}</span>
                <Link href="/research-packs" className={styles.viewLink}>View Research →</Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No opportunities detected at this time</p>
        </div>
      )}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
    </div>
  );
}
