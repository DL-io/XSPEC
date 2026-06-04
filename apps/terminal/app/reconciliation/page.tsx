'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './reconciliation.module.css';

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';

export default function ReconciliationCenter() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);

  useEffect(() => {
    fetchState();
  }, []);

  const fetchState = async () => {
    try {
      const res = await fetch(`/api/reconciliation?tenantId=${tenantId}`);
      if (!res.ok) throw new Error('Failed to fetch reconciliation state');
      const data = await res.json();
      setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading reconciliation');
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    try {
      setAcknowledging(true);
      const res = await fetch('/api/reconciliation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          action: 'acknowledge',
          reason: 'Operator acknowledged severe mismatch'
        })
      });
      if (!res.ok) throw new Error('Failed to acknowledge');
      const data = await res.json();
      setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error acknowledging');
    } finally {
      setAcknowledging(false);
    }
  };

  const handleClear = async () => {
    try {
      setAcknowledging(true);
      const res = await fetch('/api/reconciliation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          action: 'clear',
          reason: 'Operator cleared reconciliation incident'
        })
      });
      if (!res.ok) throw new Error('Failed to clear');
      const data = await res.json();
      setState(data.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error clearing');
    } finally {
      setAcknowledging(false);
    }
  };

  if (loading) return <div className={styles.loading}>Loading reconciliation center...</div>;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  const mismatchOpen = state?.severeMismatchOpen;
  const acknowledged = state?.acknowledged;
  const incident = state?.incident;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Reconciliation Center</h1>
        <Link href="/" className={styles.backLink}>← Back to Mission Control</Link>
      </div>

      <div className={`${styles.statusPanel} ${mismatchOpen ? styles.alert : styles.healthy}`}>
        <div className={styles.statusIndicator}>{mismatchOpen ? '!' : '✓'}</div>
        <div className={styles.statusContent}>
          <h2>{mismatchOpen ? 'SEVERE MISMATCH OPEN' : 'RECONCILIATION MATCHED'}</h2>
          <p>
            {mismatchOpen
              ? 'Venue and local order state have diverged. Operator intervention required.'
              : 'All orders reconciled. Venue and local state match.'}
          </p>
        </div>
      </div>

      {mismatchOpen && incident && (
        <div className={styles.incidentPanel}>
          <h2>Incident Details</h2>
          <div className={styles.incidentInfo}>
            <div className={styles.infoRow}>
              <span className={styles.label}>Status</span>
              <span className={styles.value}>{acknowledged ? 'Acknowledged' : 'Pending Review'}</span>
            </div>
            {incident.acknowledgedBy && (
              <div className={styles.infoRow}>
                <span className={styles.label}>Acknowledged By</span>
                <span className={styles.value}>{incident.acknowledgedBy}</span>
              </div>
            )}
            {incident.acknowledgmentReason && (
              <div className={styles.infoRow}>
                <span className={styles.label}>Reason</span>
                <span className={styles.value}>{incident.acknowledgmentReason}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.label}>Created At</span>
              <span className={styles.value}>{new Date(incident.createdAt).toISOString()}</span>
            </div>
          </div>

          <div className={styles.actions}>
            {!acknowledged && (
              <button className={`${styles.btn} ${styles.primary}`} onClick={handleAcknowledge} disabled={acknowledging}>
                {acknowledging ? 'Acknowledging...' : 'Acknowledge Mismatch'}
              </button>
            )}
            {acknowledged && (
              <button className={`${styles.btn} ${styles.success}`} onClick={handleClear} disabled={acknowledging}>
                {acknowledging ? 'Clearing...' : 'Clear Incident'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.guidancePanel}>
        <h2>Reconciliation Process</h2>
        <ol className={styles.processList}>
          <li><strong>Detection:</strong> System continuously compares venue orders with local state</li>
          <li><strong>Alert:</strong> Severe mismatch triggers operator alert and blocks trading</li>
          <li><strong>Investigation:</strong> Operator reviews incident details and venue responses</li>
          <li><strong>Acknowledgment:</strong> Operator acknowledges the mismatch</li>
          <li><strong>Resolution:</strong> Once resolved, operator clears the incident</li>
          <li><strong>Trading Resumes:</strong> Kill switch deactivates and trading continues</li>
        </ol>
      </div>

      <div className={styles.guidePanel}>
        <h2>Common Causes</h2>
        <ul className={styles.causesList}>
          <li>Network latency causing order confirmation delays</li>
          <li>Venue API returning stale state</li>
          <li>Partial fills not synchronized with local tracking</li>
          <li>Cancelled orders not properly reflected locally</li>
          <li>Concurrent order modifications from multiple sources</li>
        </ul>
      </div>
    </div>
  );
}
