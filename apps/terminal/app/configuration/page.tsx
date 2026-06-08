'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MANDATES } from '@polyshore/risk';
import { apiFetch, tenantId } from '../api-client';
import styles from '../operator.module.css';

interface OverviewResponse {
  safety?: {
    killSwitchActive: boolean;
    liveAuthorized: boolean;
    killSwitchReason?: string;
    liveAuthorizationReason?: string;
  };
}

interface ConfigKeyStatus {
  key: string;
  status: 'SET' | 'MISSING';
}

const activeMandate = 'conservative' as const;

export default function Configuration() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [keys, setKeys] = useState<ConfigKeyStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const [overviewRes, configRes] = await Promise.all([
          apiFetch(`/api/overview?tenantId=${tenantId}`),
          apiFetch(`/api/configuration?tenantId=${tenantId}`)
        ]);
        if (!overviewRes.ok || !configRes.ok) throw new Error('Failed to fetch configuration state');
        setOverview(await overviewRes.json() as OverviewResponse);
        const config = await configRes.json() as { keys?: ConfigKeyStatus[] };
        setKeys(config.keys ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading configuration');
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
    const interval = setInterval(fetchConfig, 30_000);
    return () => clearInterval(interval);
  }, []);

  const safety = overview?.safety ?? { killSwitchActive: true, liveAuthorized: false };
  const mode = safety.liveAuthorized ? 'LIVE' : 'PAPER';
  const mandate = MANDATES[activeMandate];

  const updateSafety = async (body: object) => {
    setUpdating(true);
    try {
      const res = await apiFetch('/api/safety', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, ...body })
      });
      if (!res.ok) {
        const payload = await res.json() as { error?: string };
        throw new Error(payload.error ?? 'Failed to update safety state');
      }
      const payload = await res.json() as { state: OverviewResponse['safety'] };
      setOverview((current) => ({ ...(current ?? {}), safety: payload.state }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error updating safety state');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <ConfigurationSkeleton />;
  if (error) return <div className={styles.error}>Error: {error}</div>;

  return (
    <div className={styles.wideContainer}>
      <div className={styles.header}>
        <h1>Runtime Configuration</h1>
        <Link href="/" className={styles.backLink}>Back to Dashboard</Link>
      </div>

      <div className={styles.banner}>Configuration changes require operator authorization and are fully audited.</div>

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Operating Mode</span>
          <span className={`${styles.badge} ${mode === 'LIVE' ? styles.live : styles.paper}`}>{mode}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Kill Switch</span>
          <span className={`${styles.badge} ${safety.killSwitchActive ? styles.rejected : styles.approved}`}>{safety.killSwitchActive ? 'ENGAGED' : 'CLEAR'}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Live Authorization</span>
          <span className={`${styles.badge} ${safety.liveAuthorized ? styles.live : styles.inactive}`}>{safety.liveAuthorized ? 'AUTHORIZED' : 'DISABLED'}</span>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Safety Controls</h2>
        <p className={styles.muted}>Kill switch and live authorization mutations are recorded in the audited config override ledger.</p>
        <div className={styles.buttonRow}>
          <button disabled={updating} onClick={() => updateSafety({ killSwitch: { active: true, reason: 'operator engaged kill switch from configuration page' } })}>Engage Kill Switch</button>
          <button disabled={updating} className={styles.secondaryButton} onClick={() => updateSafety({ killSwitch: { active: false, reason: 'operator cleared kill switch from configuration page' } })}>Clear Kill Switch</button>
          <button disabled={updating || safety.killSwitchActive} onClick={() => updateSafety({ liveAuthorization: { enabled: true, reason: 'operator authorized live trading from configuration page' } })}>Authorize Live</button>
          <button disabled={updating} className={styles.secondaryButton} onClick={() => updateSafety({ liveAuthorization: { enabled: false, reason: 'operator disabled live trading from configuration page' } })}>Disable Live</button>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Active Risk Mandate: {activeMandate}</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
              {Object.entries(mandate).map(([key, value]) => (
                <tr key={key}><td>{key}</td><td>{percent(value)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Configuration Source Presence</h2>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead><tr><th>Key</th><th>Status</th></tr></thead>
            <tbody>
              {keys.map((entry) => (
                <tr key={entry.key}>
                  <td className={styles.mono}>{entry.key}</td>
                  <td><span className={`${styles.badge} ${entry.status === 'SET' ? styles.set : styles.missing}`}>{entry.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ConfigurationSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
