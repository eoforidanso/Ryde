import { useEffect, useRef, useState } from 'react';
import * as api from '../lib/api';
import { IconBack, IconPhone, IconShield } from './Icons';

/**
 * Phone-number sign-in.
 *
 * Two steps: enter a Ghanaian mobile number, then the six-digit code sent to
 * it. The server never confirms whether a number is registered, so the second
 * step looks identical either way — errors here are deliberately vague.
 */
export default function SignIn({ onSignedIn }: { onSignedIn: (user: api.AuthUser) => void }) {
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [msisdn, setMsisdn] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [secondsLeft]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await api.requestOtp(msisdn);
      setStep('code');
      setSecondsLeft(30);
      // Mock mode returns the code so local development doesn't need real SMS.
      if (devCode) setHint(`Development mode — your code is ${devCode}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      onSignedIn(await api.verifyOtp(msisdn, code));
    } catch (err) {
      setError((err as Error).message);
      setCode('');
      codeRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  const phoneValid = msisdn.replace(/\D/g, '').length >= 9;

  return (
    <div className="panel" style={{ zIndex: 30 }}>
      <div className="panel-head">
        {step === 'code' && (
          <button
            className="icon-btn"
            onClick={() => { setStep('phone'); setCode(''); setError(null); }}
            aria-label="Back"
          >
            <IconBack />
          </button>
        )}
        <h1>{step === 'phone' ? 'Sign in' : 'Enter code'}</h1>
      </div>

      <div className="panel-body">
        {step === 'phone' ? (
          <>
            <p className="sheet-sub" style={{ marginBottom: 20 }}>
              We'll text a six-digit code to your Ghanaian mobile number. Use the number your
              mobile money is registered to.
            </p>

            <div className="field-stack" style={{ marginBottom: 14 }}>
              <label className="field">
                <IconPhone color="var(--brand-bright)" />
                <span style={{ color: 'var(--muted)', fontWeight: 600 }}>+233</span>
                <input
                  value={msisdn}
                  onChange={(e) => setMsisdn(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && phoneValid && send()}
                  placeholder="24 000 0418"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label="Mobile number"
                />
              </label>
            </div>

            <button className="btn btn-primary" disabled={!phoneValid || busy} onClick={send}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </>
        ) : (
          <>
            <p className="sheet-sub" style={{ marginBottom: 20 }}>
              Enter the code sent to {msisdn}. It expires in five minutes.
            </p>

            <div className="field-stack" style={{ marginBottom: 14 }}>
              <label className="field">
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => e.key === 'Enter' && code.length === 6 && verify()}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  aria-label="Six-digit code"
                  style={{ fontSize: 24, letterSpacing: '0.35em', fontWeight: 700 }}
                />
              </label>
            </div>

            <button className="btn btn-primary" disabled={code.length !== 6 || busy} onClick={verify}>
              {busy ? 'Checking…' : 'Verify and continue'}
            </button>

            <button
              className="btn btn-ghost"
              style={{ marginTop: 10 }}
              disabled={secondsLeft > 0 || busy}
              onClick={send}
            >
              {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : 'Resend code'}
            </button>
          </>
        )}

        {error && (
          <p style={{ color: '#ff8a84', fontSize: 13.5, marginTop: 14, fontWeight: 600 }}>{error}</p>
        )}
        {hint && (
          <p style={{ color: 'var(--gold)', fontSize: 12.5, marginTop: 14 }}>{hint}</p>
        )}

        <div
          style={{
            display: 'flex', gap: 10, alignItems: 'center', marginTop: 28,
            padding: 12, borderRadius: 14, background: 'var(--brand-soft)',
          }}
        >
          <IconShield color="var(--brand-bright)" style={{ flex: 'none' }} />
          <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
            Ryde will never call or text you asking for this code. Never share it with anyone,
            including someone claiming to be a driver or Ryde support.
          </span>
        </div>
      </div>
    </div>
  );
}
