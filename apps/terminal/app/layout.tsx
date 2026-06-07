import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

const nav = [
  ['Dashboard', '/'], // HARDENED: nav label matches the production route map.
  ['Opportunities', '/opportunities'], // HARDENED: all terminal pages are reachable from the shell.
  ['Portfolio', '/portfolio'],
  ['Audit', '/audit'],
  ['Performance', '/performance'],
  ['Reconciliation', '/reconciliation'], // HARDENED: reconciliation route was missing from global navigation.
  ['Configuration', '/configuration'],
  ['Playbooks', '/playbooks'],
  ['Research Packs', '/research-packs'],
  ['Health', '/health']
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <nav className="nav">
            <h1>POLY-SHORE OMEGA X</h1>
            {nav.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
          </nav>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
