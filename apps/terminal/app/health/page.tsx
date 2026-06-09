'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, tenantId } from '../api-client';
import styles from './health.module.css';

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

const DEP_ICONS: Record<string, string> = {
  mysql: '🗄',
  database: '🗄',
  db: '🗄',
  redis: '⚡',
  cache: '⚡',
  openai: '🤖',
  anthropic: '🤖',
  perplexity: '🔍',
  llm: '🤖',
};

function depIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(DEP_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return '🔗';
}

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.round(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

export default function SystemHealth() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await apiFetch(`/api/health?tenantId=${tenantId}`);
        if (!res.ok) throw new Error(`Health fetch failed: ${res.status}`);
        const data = await res.json();
        setWorkers(data.workers ?? []);
        setDependencies(data.dependencies ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading health');
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PageSkeleton />;
  if (error) return <div className={styles.error}>{error}</div>;

  const healthyWorkers   = workers.filter((w) => w.status === 'ok').length;
  const unhealthyWorkers = workers.filter((w) => w.status === 'error').length;
  const healthyDeps      = dependencies.filter((d) => d.status === 'ok').length;
  const unhealthyDeps    = dependencies.filter((d) => d.status === 'error').length;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <h1>System Health</h1>
          <p>Live dependency and worker status — refreshes every 5 seconds</p>
        </div>
        <Link href="/" className={styles.backLink}>← Dashboard</Link>
      </div>

      {/* Summary counts */}
      <div className={styles.summary}>
        <div className={`${styles.summaryCard} ${healthyWorkers > 0 && unhealthyWorkers === 0 ? styles.healthy : ''}`}>
          <span className={styles.count}>{healthyWorkers}/{workers.length}</span>
          <span className={styles.label}>Workers OK</span>
        </div>
        <div className={`${styles.summaryCard} ${unhealthyWorkers > 0 ? styles.error : styles.healthy}`}>
          <span className={styles.count}>{unhealthyWorkers}</span>
          <span className={styles.label}>Worker Errors</span>
        </div>
        <div className={`${styles.summaryCard} ${healthyDeps > 0 && unhealthyDeps === 0 ? styles.healthy : ''}`}>
          <span className={styles.count}>{healthyDeps}/{dependencies.length}</span>
          <span className={styles.label}>Dependencies OK</span>
        </div>
        <div className={`${styles.summaryCard} ${unhealthyDeps > 0 ? styles.error : styles.healthy}`}>
          <span className={styles.count}>{unhealthyDeps}</span>
          <span className={styles.label}>Dep. Errors</span>
        </div>
      </div>

      {/* Dependency grid */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Infrastructure</h2>
          <span className={styles.panelCount}>{dependencies.length}</span>
        </div>
        {dependencies.length > 0 ? (
          <div className={styles.depGrid}>
            {dependencies.map((dep) => (
              <div key={dep.name} className={`${styles.depTile} ${dep.status === 'ok' ? styles.healthy : styles.error}`}>
                <div className={styles.depIcon}>{depIcon(dep.name)}</div>
                <div className={styles.depName}>{dep.name}</div>
                <div className={styles.depStatusRow}>
                  <span className={`${styles.depStatusBadge} ${dep.status === 'ok' ? styles.ok : styles.err}`}>
                    <span className={styles.depStatusDot} />
                    {dep.status === 'ok' ? '✓ OK' : '✗ ERROR'}
                  </span>
                  {typeof dep.latencyMs === 'number' && (
                    <span className={styles.depLatency}>{dep.latencyMs}ms</span>
                  )}
                </div>
                {dep.error && <div className={styles.depError}>{dep.error}</div>}
                <div className={styles.depChecked}>checked {ago(dep.checkedAt)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>No dependency checks reported yet</div>
        )}
      </div>

      {/* Worker grid */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <h2>Workers</h2>
          <span className={styles.panelCount}>{workers.length}</span>
        </div>
        {workers.length > 0 ? (
          <div className={styles.workerGrid}>
            {workers.map((w) => (
              <div key={w.worker} className={`${styles.workerTile} ${w.status === 'ok' ? styles.healthy : styles.error}`}>
                <div className={styles.workerTileHeader}>
                  <div className={styles.workerTileName}>
                    <span className={styles.workerStatusDot} />
                    <span className={styles.workerName}>{w.worker.replace('-worker', '')}</span>
                  </div>
                  <span className={`${styles.workerBadge} ${w.status === 'ok' ? styles.ok : styles.err}`}>
                    {w.status === 'ok' ? 'LIVE' : 'DOWN'}
                  </span>
                </div>
                <div className={styles.workerMeta}>
                  <div className={styles.workerMetaRow}>
                    <span className={styles.workerMetaKey}>Heartbeat</span>
                    <span className={styles.workerMetaVal}>{ago(w.lastHeartbeatAt)}</span>
                  </div>
                  {w.lastSuccessAt && (
                    <div className={styles.workerMetaRow}>
                      <span className={styles.workerMetaKey}>Last Success</span>
                      <span className={styles.workerMetaVal}>{ago(w.lastSuccessAt)}</span>
                    </div>
                  )}
                  {w.lastError && (
                    <div className={styles.workerMetaRow}>
                      <span className={styles.workerMetaKey}>Error</span>
                      <span className={`${styles.workerMetaVal} ${styles.errorText}`}>{w.lastError.slice(0, 60)}{w.lastError.length > 60 ? '…' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            No worker heartbeats yet — workers report in after their first cycle
          </div>
        )}
      </div>

      {/* Pipeline reference */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}><h2>Pipeline Reference</h2></div>
        <table className={styles.responsibilityTable}>
          <tbody>
            {[
              ['scanner',        'Scans prediction markets for opportunities matching configured filters'],
              ['research',       'Generates research dossiers via LLM for markets under consideration'],
              ['execution',      'Submits and tracks orders at Polymarket and Kalshi venues'],
              ['reconciliation', 'Reconciles venue-side positions against local order state'],
              ['calibration',    'Calibrates model performance and adjusts ensemble weights'],
              ['alert',          'Dispatches alerts via configured channels (email, webhook, Slack)'],
            ].map(([name, desc]) => (
              <tr key={name}>
                <td>{name}</td>
                <td>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid">
        <div className="skeletonCard" /><div className="skeletonCard" />
        <div className="skeletonCard" /><div className="skeletonCard" />
      </div>
      <div className="skeletonWide" />
    </div>
  );
}
