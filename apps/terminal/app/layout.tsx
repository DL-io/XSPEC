import './globals.css';
import type { ReactNode } from 'react';
import NavSidebar from './NavSidebar';

export const metadata = {
  title: 'XSPEC — Prediction Market Operator Terminal',
  description: 'Institutional prediction market operator terminal for Polymarket and Kalshi'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <NavSidebar />
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
