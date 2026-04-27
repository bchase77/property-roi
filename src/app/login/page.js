'use client';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function LoginForm() {
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/dashboard';
  const error = searchParams.get('error');
  const [loading, setLoading] = useState(false);

  return (
    <main style={{
      minHeight: '100vh', background: '#111827',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
    }}>
      <div style={{
        background: '#1f2937', border: '1px solid #374151',
        borderRadius: 12, padding: '40px 48px', width: '100%', maxWidth: 380,
      }}>
        <h1 style={{ color: 'white', fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
          Sign in
        </h1>
        <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 28 }}>
          RE ROI Calculator
        </p>

        {error && (
          <div style={{
            background: '#450a0a', border: '1px solid #7f1d1d',
            borderRadius: 6, padding: '10px 14px', marginBottom: 20,
            color: '#fca5a5', fontSize: 14,
          }}>
            Incorrect password — try again.
          </div>
        )}

        <form method="POST" action="/api/auth/login" onSubmit={() => setLoading(true)}>
          <input type="hidden" name="from" value={from} />
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block', color: '#d1d5db',
              fontSize: 13, fontWeight: 500, marginBottom: 6,
            }}>
              Password
            </label>
            <input
              type="password"
              name="password"
              autoFocus
              required
              style={{
                width: '100%', background: '#111827',
                border: '1px solid #374151', borderRadius: 6,
                padding: '10px 14px', color: 'white', fontSize: 15,
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', background: loading ? '#1d4ed8' : '#2563eb',
              color: 'white', border: 'none', borderRadius: 6,
              padding: '11px 0', fontSize: 15, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.75 : 1, transition: 'opacity 0.15s',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
