import './globals.css';
import Link from 'next/link';
import type { ReactNode } from 'react';

const nav = [
  ['Mission Control', '/'],
  ['Opportunity Feed', '/opportunities'],
  ['Portfolio', '/portfolio'],
  ['Performance', '/performance'],
  ['Audit Explorer', '/audit'],
  ['Configuration', '/configuration'],
  ['Playbooks', '/playbooks'],
  ['System Health', '/health'],
  ['Research Packs', '/research-packs']
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
