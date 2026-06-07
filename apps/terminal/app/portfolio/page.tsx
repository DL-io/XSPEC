'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './portfolio.module.css';

const tenantId = process.env.NEXT_PUBLIC_TENANT_ID || 'demo-tenant';

interface Position {
  id: string;
  marketId: string;
  venue: string;
  side: string;
  quantity: number;
  averagePrice: number;
  marketValue: number;
  category: string;
}

export default function Portfolio() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/overview?tenantId=${tenantId}`);
        if (!res.ok) throw new Error('Failed to fetch portfolio');
        setData(await res.json());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading portfolio');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <PageSkeleton />; // HARDENED: first portfolio fetch shows a skeleton state.
  if (error) return <div className={styles.error}>Error: {error}</div>;

  const portfolio = data?.portfolio || { positions: [], totalExposure: 0, cash: 0, equity: 0 };
  const positions: Position[] = portfolio.positions || [];

  const categoryExposure: Record<string, number> = {};
  positions.forEach((pos: Position) => {
    if (!categoryExposure[pos.category]) categoryExposure[pos.category] = 0;
    categoryExposure[pos.category] += pos.marketValue;
  });

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Portfolio Positions</h1>
        <Link href="/" className={styles.backLink}>← Back to Mission Control</Link>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Total Equity</span>
          <span className={styles.value}>${portfolio.equity?.toFixed(2) || '0.00'}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Total Exposure</span>
          <span className={styles.value}>${portfolio.totalExposure?.toFixed(2) || '0.00'}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Cash Available</span>
          <span className={styles.value}>${portfolio.cash?.toFixed(2) || '0.00'}</span>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.label}>Open Positions</span>
          <span className={styles.value}>{positions.length}</span>
        </div>
      </div>

      {positions.length > 0 ? (
        <div className={styles.panel}>
          <h2>Active Positions</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Market ID</th>
                  <th>Venue</th>
                  <th>Side</th>
                  <th>Quantity</th>
                  <th>Avg Price</th>
                  <th>Market Value</th>
                  <th>Category</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos) => (
                  <tr key={pos.id}>
                    <td><code>{pos.marketId.slice(0, 16)}...</code></td>
                    <td>{pos.venue}</td>
                    <td><span className={`${styles.badge} ${pos.side === 'YES' ? styles.long : styles.short}`}>{pos.side}</span></td>
                    <td>{pos.quantity.toFixed(2)}</td>
                    <td>${pos.averagePrice.toFixed(4)}</td>
                    <td className={pos.marketValue >= 0 ? styles.positive : styles.negative}>${pos.marketValue.toFixed(2)}</td>
                    <td>{pos.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={styles.emptyState}>
          <p>No open positions</p>
        </div>
      )}

      {Object.keys(categoryExposure).length > 0 && (
        <div className={styles.panel}>
          <h2>Category Exposure</h2>
          <div className={styles.categoryList}>
            {Object.entries(categoryExposure).map(([category, exposure]) => (
              <div key={category} className={styles.categoryItem}>
                <span className={styles.categoryName}>{category}</span>
                <div className={styles.categoryBar}>
                  <div className={styles.categoryFill} style={{ width: `${Math.min(100, (exposure / portfolio.totalExposure) * 100)}%` }} />
                </div>
                <span className={styles.categoryValue}>${exposure.toFixed(2)}</span>
              </div>
            ))}
          </div>
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
      <div className="skeletonWide" />
    </div>
  );
}
