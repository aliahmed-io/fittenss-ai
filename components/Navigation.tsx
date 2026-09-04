'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/workouts', label: 'Workouts' },
  { href: '/nutrition', label: 'Nutrition' },
  { href: '/progress', label: 'Progress' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--ft-void)',
        borderBottom: '1px solid var(--ft-rule)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '52px',
          paddingInline: '32px',
        }}
      >
        {/* Wordmark */}
        <Link
          href="/"
          aria-label="FitTransform AI"
          style={{ marginRight: '40px', textDecoration: 'none', flexShrink: 0 }}
        >
          <span
            style={{
              fontFamily: '"Barlow Condensed", sans-serif',
              fontWeight: 900,
              fontSize: '20px',
              textTransform: 'uppercase',
              letterSpacing: '-0.01em',
              color: 'var(--ft-t1)',
            }}
          >
            FIT<span style={{ color: 'var(--ft-lime)' }}>TRANSFORM</span>
          </span>
        </Link>

        {/* Nav */}
        <nav
          role="navigation"
          aria-label="Main navigation"
          style={{ display: 'flex', alignItems: 'stretch', flex: 1, height: '52px' }}
        >
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  paddingInline: '20px',
                  fontSize: '10px',
                  fontWeight: 500,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  color: isActive ? 'var(--ft-t1)' : 'var(--ft-t3)',
                  borderBottom: isActive ? '2px solid var(--ft-lime)' : '2px solid transparent',
                  transition: 'color 0.15s ease',
                }}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* CTA */}
        <Link
          href="/?scan=1"
          className="btn-lime"
          style={{ padding: '10px 20px', textDecoration: 'none' }}
        >
          Scan ↗
        </Link>
      </div>
    </header>
  );
}

// Keep export for backward compatibility
export function AuroraBackground() {
  return null;
}
