'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../operator.module.css';

interface OverviewResponse {
  safety?: { killSwitchActive: boolean; liveAuthorized: boolean };
  reconciliation?: { severeMismatchOpen: boolean };
}

interface ExamplePlaybook {
  name: string;
  summary: string;
  filterRate: string;
}

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';
const examples: ExamplePlaybook[] = [
  { name: 'Conservative Filter', summary: 'edge > 6%, confidence > 70%, max position $500', filterRate: '18-24%' },
  { name: 'High Conviction Only', summary: 'edge > 10%, confidence > 80%, exclude low-liquidity markets', filterRate: '6-10%' },
  { name: 'Category Specialist', summary: 'only politics + economics markets, edge > 7%', filterRate: '12-16%' }
];

export default function Playbooks() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const res = await fetch(`/api/overview?tenantId=${tenantId}`);
        if (!res.ok) throw new Error('Failed to fetch system context');
        setOverview(await res.json() as OverviewResponse);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading playbooks');
      } finally {
        setLoading(false);
      }
    };

    fetchOverview();
    const interval = setInterval(fetchOverview, 30_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PlaybookSkeleton />;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  const liveMode = overview?.safety?.liveAuthorized;
  const blocked = overview?.safety?.killSwitchActive || overview?.reconciliation?.severeMismatchOpen;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Playbook Library</h1>
        <Link href="/" className={styles.backLink}>Back to Dashboard</Link>
      </div>

      <div className={styles.banner}>
        Playbooks will enable automated conditional rules like: if edge &gt; 8% AND confidence &gt; 75% AND category != politics THEN approve.
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Roadmap Status</span>
          <span className={`${styles.badge} ${styles.info}`}>Coming in v2</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Current Mode</span>
          <span className={`${styles.badge} ${liveMode ? styles.live : styles.paper}`}>{liveMode ? 'LIVE' : 'PAPER'}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Automation Gate</span>
          <span className={`${styles.badge} ${blocked ? styles.rejected : styles.approved}`}>{blocked ? 'BLOCKED' : 'CLEAR'}</span>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Example Playbook Blueprints</h2>
        <div className={styles.grid}>
          {examples.map((playbook) => (
            <div key={playbook.name} className={styles.card}>
              <div className={styles.slideHeader}>
                <h3 className={styles.cardTitle}>{playbook.name}</h3>
                <span className={`${styles.badge} ${styles.inactive}`}>INACTIVE</span>
              </div>
              <p className={styles.muted}>{playbook.summary}</p>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <tbody>
                    <tr><td>Estimated Filter Rate</td><td>{playbook.filterRate}</td></tr>
                    <tr><td>Status</td><td>Read-only preview</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
        <div className={styles.buttonRow}>
          <button type="button">Notify me when available</button>
        </div>
      </div>
    </div>
  );
}

function PlaybookSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );
}
