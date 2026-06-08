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
  metadata?: Record<string, unknown>;
}

interface Dependency {
  name: string;
  status: 'ok' | 'error';
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}

export default function SystemHealth() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkers = async () => {
      try {
        const res = await apiFetch(`/api/health?tenantId=${tenantId}`);
        if (!res.ok) throw new Error('Failed to fetch worker health');
        const data = await res.json();
        setWorkers(data.workers || []);
        setDependencies(data.dependencies || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading health');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkers();
    const interval = setInterval(fetchWorkers, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <PageSkeleton />; // HARDENED: first health fetch shows a skeleton state.
  if (error) return <div className={styles.error}>Error: {error}</div>;

  const healthyCount = workers.filter((w) => w.status === 'ok').length;
  const unhealthyCount = workers.filter((w) => w.status === 'error').length;
  const unhealthyDependencyCount = dependencies.filter((dependency) => dependency.status === 'error').length;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>System Health</h1>
        <Link href="/" className={styles.backLink}>← Back to Mission Control</Link>
      </div>

      <div className={styles.summary}>
        <div className={`${styles.summaryCard} ${styles.healthy}`}>
          <span className={styles.count}>{healthyCount}</span>
          <span className={styles.label}>Healthy Workers</span>
        </div>
        <div className={`${styles.summaryCard} ${unhealthyCount > 0 ? styles.error : styles.healthy}`}>
          <span className={styles.count}>{unhealthyCount}</span>
          <span className={styles.label}>Unhealthy Workers</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.count}>{workers.length}</span>
          <span className={styles.label}>Total Workers</span>
        </div>
        <div className={`${styles.summaryCard} ${unhealthyDependencyCount > 0 ? styles.error : styles.healthy}`}>
          <span className={styles.count}>{dependencies.length - unhealthyDependencyCount}/{dependencies.length}</span>
          <span className={styles.label}>Dependencies</span>
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Dependency Status</h2>
        <div className={styles.workersList}>
          {dependencies.length > 0 ? (
            dependencies.map((dependency) => (
              <div key={dependency.name} className={`${styles.workerCard} ${dependency.status === 'ok' ? styles.healthy : styles.error}`}>
                <div className={styles.workerHeader}>
                  <div className={styles.workerName}>
                    <span className={styles.statusDot} />
                    <span className={styles.name}>{dependency.name}</span>
                  </div>
                  <span className={`${styles.badge} ${dependency.status === 'ok' ? styles.ok : styles.err}`}>
                    {dependency.status === 'ok' ? 'OK' : 'ERROR'}
                  </span>
                </div>
                <div className={styles.workerDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Checked</span>
                    <span className={styles.value}>{new Date(dependency.checkedAt).toLocaleTimeString()}</span>
                  </div>
                  {typeof dependency.latencyMs === 'number' && (
                    <div className={styles.detail}>
                      <span className={styles.label}>Latency</span>
                      <span className={styles.value}>{dependency.latencyMs}ms</span>
                    </div>
                  )}
                  {dependency.error && (
                    <div className={styles.detail}>
                      <span className={styles.label}>Last Error</span>
                      <span className={`${styles.value} ${styles.errorText}`}>{dependency.error}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>No dependencies reported</div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Worker Status</h2>
        <div className={styles.workersList}>
          {workers.length > 0 ? (
            workers.map((worker) => (
              <div key={worker.worker} className={`${styles.workerCard} ${worker.status === 'ok' ? styles.healthy : styles.error}`}>
                <div className={styles.workerHeader}>
                  <div className={styles.workerName}>
                    <span className={styles.statusDot} />
                    <span className={styles.name}>{worker.worker}</span>
                  </div>
                  <span className={`${styles.badge} ${worker.status === 'ok' ? styles.ok : styles.err}`}>
                    {worker.status === 'ok' ? 'OK' : 'ERROR'}
                  </span>
                </div>
                <div className={styles.workerDetails}>
                  <div className={styles.detail}>
                    <span className={styles.label}>Last Heartbeat</span>
                    <span className={styles.value}>{new Date(worker.lastHeartbeatAt).toLocaleTimeString()}</span>
                  </div>
                  {worker.lastSuccessAt && (
                    <div className={styles.detail}>
                      <span className={styles.label}>Last Success</span>
                      <span className={styles.value}>{new Date(worker.lastSuccessAt).toLocaleTimeString()}</span>
                    </div>
                  )}
                  {worker.lastError && (
                    <div className={styles.detail}>
                      <span className={styles.label}>Last Error</span>
                      <span className={`${styles.value} ${styles.errorText}`}>{worker.lastError}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className={styles.emptyState}>No workers connected</div>
          )}
        </div>
      </div>

      <div className={styles.panel}>
        <h2>Worker Responsibilities</h2>
        <div className={styles.responsibilitiesList}>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Scanner</span>
            <span>Continuously scans prediction markets for opportunities</span>
          </div>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Research</span>
            <span>Generates research dossiers for markets under consideration</span>
          </div>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Models</span>
            <span>Executes ensemble models and generates probability estimates</span>
          </div>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Execution</span>
            <span>Manages order submission and venue communication</span>
          </div>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Reconciliation</span>
            <span>Reconciles venue state with local order tracking</span>
          </div>
          <div className={styles.responsibility}>
            <span className={styles.workerLabel}>Alerts</span>
            <span>Dispatches alerts through configured channels</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="skeletonPage">
      <div className="skeletonHeader" />
      <div className="skeletonGrid"><div className="skeletonCard" /><div className="skeletonCard" /><div className="skeletonCard" /></div>
      <div className="skeletonWide" />
    </div>
  );
}
