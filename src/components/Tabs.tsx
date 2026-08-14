import { useEffect, useMemo, useState } from 'react';
import { PRODUCT_BY_ID } from '../data/products';
import * as api from '../lib/api';
import { formatGHS } from '../lib/pricing';
import { useRyde } from '../store/RydeStore';
import { ProductIcon } from './productIcon';
import {
  IconAlert, IconBriefcase, IconCar, IconChevron, IconHome, IconPlus, IconReceipt,
  IconRoute, IconShield, IconStarFilled, IconUsers, IconWallet,
} from './Icons';

/* ------------------------------------------------------------------ */
/* Activity                                                            */
/* ------------------------------------------------------------------ */

export function ActivityTab() {
  const { state } = useRyde();

  const totals = useMemo(() => {
    const spend = state.history.reduce((s, t) => s + t.fare, 0);
    const km = state.history.reduce((s, t) => s + t.distanceKm, 0);
    return { spend, km, trips: state.history.length };
  }, [state.history]);

  return (
    <div className="panel" style={{ animation: 'none' }}>
      <div className="panel-head">
        <h1>Activity</h1>
      </div>
      <div className="panel-body">
        <div className="stat-grid">
          <div className="stat">
            <div className="n">{totals.trips}</div>
            <div className="l">Trips</div>
          </div>
          <div className="stat">
            <div className="n">{totals.km.toFixed(0)} km</div>
            <div className="l">Distance</div>
          </div>
          <div className="stat">
            <div className="n">GH₵{Math.round(totals.spend)}</div>
            <div className="l">Spent</div>
          </div>
        </div>

        <div className="section-label">Past rides</div>
        {state.history.map((t) => (
          <div key={t.id} className="list-row">
            <span className="list-icon"><ProductIcon id={t.product} size={20} /></span>
            <span className="list-main">
              <span className="list-title">{t.dropoff}</span>
              <span className="list-sub">
                {t.when} · {PRODUCT_BY_ID[t.product].name} · {t.driver}
              </span>
            </span>
            <span style={{ textAlign: 'right', flex: 'none' }}>
              <div className="list-meta">{formatGHS(t.fare)}</div>
              {t.rating && (
                <div className="rating-inline" style={{ fontSize: 12, justifyContent: 'flex-end' }}>
                  <IconStarFilled width={11} height={11} />
                  {t.rating}
                </div>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wallet                                                              */
/* ------------------------------------------------------------------ */

const TOP_UPS = [20, 50, 100, 200];

export function WalletTab() {
  const { state, dispatch } = useRyde();
  const [busy, setBusy] = useState(false);

  // Pull the authoritative balance whenever the tab opens.
  useEffect(() => {
    if (!api.isLive()) return;
    api.getWallet()
      .then((w) => dispatch({ type: 'syncWallet', balance: api.toCedis(w.balancePesewas) }))
      .catch(() => dispatch({ type: 'toast', message: 'Could not reach payments service' }));
  }, [dispatch]);

  /**
   * Top up over Hubtel. The rider approves a prompt on their handset, so the
   * charge is asynchronous: we poll our own service until it reaches a terminal
   * state rather than assuming success.
   */
  const topUp = async (amount: number) => {
    if (!api.isLive()) {
      dispatch({ type: 'topUp', amount, method: 'MTN MoMo 024 •••• 418' });
      return;
    }
    setBusy(true);
    // Stable key for this tap: a double-tap cannot become a double-charge.
    const key = `topup-${Date.now()}-${amount}`;
    try {
      const { reference, message } = await api.topUp(amount, key);
      dispatch({ type: 'toast', message: message ?? 'Approve the prompt on your phone' });

      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const payment = await api.getPayment(reference);
        if (payment.status === 'SUCCESS') {
          const wallet = await api.getWallet();
          dispatch({ type: 'syncWallet', balance: api.toCedis(wallet.balancePesewas) });
          dispatch({ type: 'toast', message: `GH₵${amount} added to Ryde Cash` });
          return;
        }
        if (payment.status === 'FAILED' || payment.status === 'EXPIRED') {
          dispatch({ type: 'toast', message: 'Top up was not approved' });
          return;
        }
      }
      dispatch({ type: 'toast', message: 'Still waiting for approval — check your phone' });
    } catch (err) {
      dispatch({ type: 'toast', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel" style={{ animation: 'none' }}>
      <div className="panel-head">
        <h1>Wallet</h1>
      </div>
      <div className="panel-body">
        <div className="balance-card">
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em' }}>
            RYDE CASH BALANCE
          </div>
          <div className="balance-amount">{formatGHS(state.walletBalance)}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
            Linked to MTN MoMo 024 •••• 418
          </div>
        </div>

        <div className="section-label">Quick top up</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          {TOP_UPS.map((amount) => (
            <button key={amount} className="tip" disabled={busy} onClick={() => topUp(amount)}>
              +{amount}
            </button>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 0 }}>
          You will get a MoMo prompt on your phone to approve the top up.
        </p>

        <div className="section-label">Payment methods</div>
        <button className="list-row" onClick={() => dispatch({ type: 'sheet', sheet: 'payment' })}>
          <span className="list-icon accent"><IconWallet /></span>
          <span className="list-main">
            <span className="list-title">Manage payment methods</span>
            <span className="list-sub">MoMo, cards and cash</span>
          </span>
          <IconChevron width={17} height={17} color="var(--muted)" />
        </button>

        <div className="section-label">Transactions</div>
        {state.walletLedger.map((e) => (
          <div key={e.id} className="list-row">
            <span className="list-icon" style={e.amount > 0 ? { background: 'var(--brand-soft)', color: 'var(--brand-bright)' } : undefined}>
              {e.amount > 0 ? <IconPlus /> : <IconReceipt />}
            </span>
            <span className="list-main">
              <span className="list-title">{e.label}</span>
              <span className="list-sub">{e.detail} · {e.when}</span>
            </span>
            <span className="list-meta" style={{ color: e.amount > 0 ? 'var(--brand-bright)' : 'var(--text-dim)' }}>
              {e.amount > 0 ? '+' : '−'}{formatGHS(Math.abs(e.amount))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

export function AccountTab() {
  const { state, dispatch } = useRyde();

  const rating = useMemo(() => {
    const rated = state.history.filter((t) => t.rating);
    if (rated.length === 0) return '5.00';
    return (rated.reduce((s, t) => s + (t.rating ?? 0), 0) / rated.length).toFixed(2);
  }, [state.history]);

  return (
    <div className="panel" style={{ animation: 'none' }}>
      <div className="panel-head">
        <h1>Account</h1>
      </div>
      <div className="panel-body">
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="avatar" style={{ width: 58, height: 58 }}>AB</span>
          <span style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: '-0.025em' }}>Ama Boakye</div>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>+233 24 ••• 4418 · Accra</div>
            <div className="rating-inline" style={{ marginTop: 5 }}>
              <IconStarFilled width={13} height={13} />
              {rating} rider rating
            </div>
          </span>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="list-icon gold"><IconCar /></span>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>Driver mode</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Switch to the driver app and start earning
            </div>
          </span>
          <button
            className={`switch ${state.driverMode ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'driverMode', on: !state.driverMode })}
            aria-label="Toggle driver mode"
            aria-pressed={state.driverMode}
          />
        </div>

        <div className="section-label">Saved places</div>
        <button className="list-row" onClick={() => dispatch({ type: 'toast', message: 'Edit your home address' })}>
          <span className="list-icon accent"><IconHome /></span>
          <span className="list-main">
            <span className="list-title">Home</span>
            <span className="list-sub">East Legon Hills</span>
          </span>
          <IconChevron width={17} height={17} color="var(--muted)" />
        </button>
        <button className="list-row" onClick={() => dispatch({ type: 'toast', message: 'Edit your work address' })}>
          <span className="list-icon accent"><IconBriefcase /></span>
          <span className="list-main">
            <span className="list-title">Work</span>
            <span className="list-sub">Airport City</span>
          </span>
          <IconChevron width={17} height={17} color="var(--muted)" />
        </button>

        <div className="section-label">Settings</div>
        {[
          { icon: <IconShield />, title: 'Safety centre', sub: 'Trusted contacts, PIN verification', action: () => dispatch({ type: 'sheet', sheet: 'safety' }) },
          { icon: <IconUsers />, title: 'Invite friends', sub: 'You both get GH₵20 off — code AMA4418', action: () => dispatch({ type: 'toast', message: 'Referral code AMA4418 copied' }) },
          { icon: <IconRoute />, title: 'Ryde for Business', sub: 'Bill trips to your company account', action: () => dispatch({ type: 'toast', message: 'Business profile coming soon' }) },
          { icon: <IconAlert />, title: 'Help and disputes', sub: 'Report a fare or a lost item', action: () => dispatch({ type: 'toast', message: 'Our Accra support team replies in minutes' }) },
        ].map((row) => (
          <button key={row.title} className="list-row" onClick={row.action}>
            <span className="list-icon">{row.icon}</span>
            <span className="list-main">
              <span className="list-title">{row.title}</span>
              <span className="list-sub">{row.sub}</span>
            </span>
            <IconChevron width={17} height={17} color="var(--muted)" />
          </button>
        ))}

        {api.isLive() && (
          <>
            <div className="section-label">Security</div>
            <button
              className="list-row"
              onClick={async () => {
                const { revoked } = await api.revokeAllSessions();
                dispatch({ type: 'toast', message: `Signed out of ${revoked} device(s)` });
                window.location.reload();
              }}
            >
              <span className="list-icon" style={{ background: 'var(--red-soft)', color: '#ff8a84' }}>
                <IconAlert />
              </span>
              <span className="list-main">
                <span className="list-title">Sign out everywhere</span>
                <span className="list-sub">Use this if your phone is lost or stolen</span>
              </span>
              <IconChevron width={17} height={17} color="var(--muted)" />
            </button>

            <div style={{ marginTop: 14 }}>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  await api.logout();
                  window.location.reload();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}

        <p style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, marginTop: 24 }}>
          Ryde Ghana Ltd · Airport City, Accra<br />Version 1.0.0
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Driver mode                                                         */
/* ------------------------------------------------------------------ */

interface Request {
  rider: string;
  from: string;
  to: string;
  fare: number;
  km: number;
  pickupMin: number;
  rating: number;
}

const REQUESTS: Request[] = [
  { rider: 'Kwesi A.', from: 'Shiashie', to: 'Kotoka Airport T3', fare: 42.5, km: 6.2, pickupMin: 3, rating: 4.9 },
  { rider: 'Naa D.', from: 'Osu Oxford Street', to: 'Dansoman Estates', fare: 68, km: 11.4, pickupMin: 5, rating: 4.7 },
  { rider: 'Yaw B.', from: 'Madina Market', to: 'Accra Mall', fare: 37, km: 8.9, pickupMin: 4, rating: 5 },
];

export function DriverModeApp() {
  const { state, dispatch } = useRyde();
  const [index, setIndex] = useState(0);
  const request = REQUESTS[index % REQUESTS.length];

  const next = () => setIndex((i) => i + 1);

  return (
    <div className="panel" style={{ animation: 'none' }}>
      <div className="panel-head">
        <h1>Driver</h1>
        <span style={{ marginLeft: 'auto' }} className={`chip ${state.driverOnline ? 'ok' : ''}`}>
          <span className="dot" style={{ background: state.driverOnline ? undefined : 'var(--muted)' }} />
          {state.driverOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="panel-body">
        <div className="balance-card">
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em' }}>
            TODAY'S EARNINGS
          </div>
          <div className="balance-amount">{formatGHS(state.driverEarnings)}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12.5, color: 'var(--text-dim)' }}>
            <span><strong style={{ color: 'var(--text)' }}>{state.driverTripsToday}</strong> trips</span>
            <span><strong style={{ color: 'var(--text)' }}>6h 12m</strong> online</span>
            <span><strong style={{ color: 'var(--text)' }}>4.91</strong> rating</span>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="list-icon gold"><IconCar /></span>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 650 }}>Go online</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              {state.driverOnline ? 'Receiving trip requests around Spintex' : 'You will not receive requests'}
            </div>
          </span>
          <button
            className={`switch ${state.driverOnline ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'driverOnline', on: !state.driverOnline })}
            aria-label="Toggle online"
            aria-pressed={state.driverOnline}
          />
        </div>

        {state.driverOnline ? (
          <>
            <div className="section-label">Incoming request</div>
            <div className="card fade-in" key={index} style={{ borderColor: 'rgba(20,208,125,0.35)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>
                  {request.rider.slice(0, 2)}
                </span>
                <span style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{request.rider}</div>
                  <div className="rating-inline" style={{ fontSize: 12 }}>
                    <IconStarFilled width={11} height={11} />{request.rating.toFixed(1)}
                  </div>
                </span>
                <span style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 20, fontWeight: 780, letterSpacing: '-0.03em' }}>
                    {formatGHS(request.fare)}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{request.km} km trip</div>
                </span>
              </div>

              <div className="route-summary" style={{ paddingTop: 0 }}>
                <div className="route-rail">
                  <span className="node node-a" />
                  <span className="line" />
                  <span className="node node-b" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{request.from}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', margin: '2px 0 10px' }}>
                    {request.pickupMin} min away
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{request.to}</div>
                </div>
              </div>

              <div className="btn-row" style={{ marginTop: 8 }}>
                <button className="btn btn-ghost" onClick={next}>Decline</button>
                <button
                  className="btn btn-primary"
                  onClick={() => { dispatch({ type: 'driverAccept', fare: request.fare }); next(); }}
                >
                  Accept
                </button>
              </div>
            </div>

            <div className="section-label">Hotspots right now</div>
            {[
              { area: 'Kotoka Airport', note: 'Long queue of arrivals', mult: '1.6×' },
              { area: 'Osu / Oxford Street', note: 'Evening demand climbing', mult: '1.4×' },
              { area: 'Madina Zongo Junction', note: 'Steady commuter demand', mult: '1.2×' },
            ].map((h) => (
              <div key={h.area} className="list-row">
                <span className="list-icon gold"><IconRoute /></span>
                <span className="list-main">
                  <span className="list-title">{h.area}</span>
                  <span className="list-sub">{h.note}</span>
                </span>
                <span className="badge">{h.mult}</span>
              </div>
            ))}
          </>
        ) : (
          <div className="empty">
            <IconCar />
            <div>You're offline</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>Go online to start receiving trips</div>
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <button className="btn btn-dark" onClick={() => dispatch({ type: 'driverMode', on: false })}>
            Switch back to riding
          </button>
        </div>
      </div>
    </div>
  );
}
