import { useMemo } from 'react';
import { haversineKm } from '../data/network';
import { PLACES } from '../data/places';
import { PRODUCT_BY_ID } from '../data/products';
import { formatGHS } from '../lib/pricing';
import { tierFor, weeklyChallenges } from '../lib/rewards';
import { driverStats, useRyde } from '../store/RydeStore';
import { ProductIcon } from './productIcon';
import {
  IconCar, IconChat, IconChevron, IconPhone, IconRoute, IconShield, IconStarFilled, IconTrophy,
  IconUsers,
} from './Icons';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('');
}

function hoursMinutes(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function DriverTopBar() {
  const { state, dispatch } = useRyde();
  const busy = state.driverPhase !== 'idle' && state.driverPhase !== 'offline';

  return (
    <div className="topbar">
      <div className="brandmark">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <rect width="100" height="100" rx="26" fill="var(--gold)" />
          <path
            d="M50 20l7.2 22.1h23.2l-18.8 13.7 7.2 22.1L50 64.2 31.2 77.9l7.2-22.1-18.8-13.7h23.2z"
            fill="#1a1408"
          />
        </svg>
        Driver
      </div>

      <div className={`chip ${state.driverOnline ? 'ok' : ''}`}>
        <span className="dot" style={{ background: state.driverOnline ? undefined : 'var(--muted)' }} />
        {state.driverOnline ? 'Online' : 'Offline'}
      </div>

      <div className="chip" style={{ marginLeft: 'auto', color: 'var(--gold)' }} title="Today's earnings">
        {formatGHS(state.driverEarnings)}
      </div>

      {!busy && (
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'driverMode', on: false })}
          aria-label="Switch to riding"
          title="Switch to riding"
        >
          <IconUsers />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function TodayStats() {
  const { state } = useRyde();
  return (
    <div className="stat-grid">
      <div className="stat">
        <div className="n">{formatGHS(state.driverEarnings).replace('.00', '')}</div>
        <div className="l">Earned</div>
      </div>
      <div className="stat">
        <div className="n">{state.driverTripsToday}</div>
        <div className="l">Trips</div>
      </div>
      <div className="stat">
        <div className="n">{hoursMinutes(state.onlineSeconds)}</div>
        <div className="l">Online</div>
      </div>
    </div>
  );
}

/**
 * Tier and the nearest challenge, condensed to one row.
 *
 * The driver gets the whole picture in the Rewards sheet; what belongs on the
 * working screens is the single next thing worth chasing, with the money on it.
 */
function RewardsRow() {
  const { state, dispatch } = useRyde();
  const stats = driverStats(state);
  const standing = tierFor(stats.weekTrips, stats.rating);
  const next = weeklyChallenges(stats)
    .filter((c) => !c.done)
    .sort((a, b) => b.progress / b.target - a.progress / a.target)[0];

  return (
    <button className="reward-row" onClick={() => dispatch({ type: 'sheet', sheet: 'rewards' })}>
      <span className="tier-badge" style={{ background: standing.tier.colour }}>
        <IconTrophy width={18} height={18} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="list-title">
          {standing.tier.name} · {(standing.tier.commission * 100).toFixed(1)}% commission
        </span>
        <span className="list-sub">
          {next
            ? `${next.title} — ${Math.max(0, next.target - Math.floor(next.progress))} to go for ${formatGHS(next.reward).replace('.00', '')}`
            : 'Every challenge cleared this week'}
        </span>
        {next && (
          <span className="progress-track" style={{ margin: '8px 0 0' }}>
            <span
              className="progress-fill"
              style={{ width: `${Math.min(100, (next.progress / next.target) * 100)}%` }}
            />
          </span>
        )}
      </span>
      <IconChevron width={17} height={17} color="var(--muted)" />
    </button>
  );
}

function JourneyRail({ from, to, fromNote, toNote }: {
  from: string; to: string; fromNote?: string; toNote?: string;
}) {
  return (
    <div className="route-summary">
      <div className="route-rail">
        <span className="node node-a" />
        <span className="line" />
        <span className="node node-b" />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="journey-place">{from}</div>
        <div className="journey-note">{fromNote}</div>
        <div className="journey-place" style={{ marginTop: 10 }}>{to}</div>
        <div className="journey-note">{toNote}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Phase sheets                                                        */
/* ------------------------------------------------------------------ */

function OfflineSheet() {
  const { state, dispatch } = useRyde();
  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <h2 className="sheet-title">You're offline</h2>
        <p className="sheet-sub">Go online to start receiving trip requests around you.</p>

        <TodayStats />
        <RewardsRow />

        <button className="btn btn-primary" onClick={() => dispatch({ type: 'driverOnline', on: true })}>
          <IconCar width={19} height={19} />
          Go online
        </button>

        {state.driverLog.length > 0 && (
          <>
            <div className="section-label">Recent trips</div>
            {state.driverLog.slice(0, 4).map((t) => (
              <div key={t.id} className="list-row">
                <span className="list-icon gold"><IconRoute /></span>
                <span className="list-main">
                  <span className="list-title">{t.dropoff}</span>
                  <span className="list-sub">{t.rider} · {t.km.toFixed(1)} km · {t.minutes} min</span>
                </span>
                <span className="list-meta" style={{ color: 'var(--brand-bright)' }}>
                  +{formatGHS(t.earnings)}
                </span>
              </div>
            ))}
          </>
        )}

        <div style={{ marginTop: 14 }}>
          <button className="btn btn-dark" onClick={() => dispatch({ type: 'driverMode', on: false })}>
            Switch back to riding
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchingSheet() {
  const { state, dispatch, traffic } = useRyde();

  // Name the nearest real place so "looking for trips" feels located.
  const area = useMemo(() => {
    let best = 'Accra';
    let bestKm = Infinity;
    for (const place of PLACES) {
      const km = haversineKm(state.driverPos, place);
      if (km < bestKm) {
        bestKm = km;
        best = place.area;
      }
    }
    return best;
  }, [state.driverPos]);

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <div className="matching-orb" style={{ margin: '2px auto 14px' }}>
          <span className="ring" />
          <span className="ring" />
          <span className="ring" />
          <span className="matching-core"><IconCar width={22} height={22} /></span>
        </div>

        <h2 className="sheet-title" style={{ textAlign: 'center' }}>Looking for trips</h2>
        <p className="sheet-sub" style={{ textAlign: 'center' }}>
          {traffic.label} · demand is {traffic.surge > 1.3 ? 'high' : traffic.surge > 1 ? 'picking up' : 'steady'} around {area}
        </p>

        <TodayStats />
        <RewardsRow />

        <div className="section-label">Busiest right now</div>
        {[
          { area: 'Kotoka Airport', note: 'Arrivals queue building', mult: `${(traffic.surge * 1.15).toFixed(1)}×` },
          { area: 'Osu / Oxford Street', note: 'Evening demand', mult: `${traffic.surge.toFixed(1)}×` },
          { area: 'Madina Zongo Junction', note: 'Commuter traffic', mult: `${Math.max(1, traffic.surge * 0.9).toFixed(1)}×` },
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

        <div style={{ marginTop: 14 }}>
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'driverOnline', on: false })}>
            Go offline
          </button>
        </div>
      </div>
    </div>
  );
}

function IncomingSheet() {
  const { state, dispatch } = useRyde();
  const job = state.driverJob;
  if (!job) return null;

  const pct = Math.max(0, Math.min(1, state.acceptSecondsLeft / 15));
  const circumference = 2 * Math.PI * 26;

  return (
    <div className="sheet offer">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <div className="offer-head">
          <span className="offer-timer" aria-label={`${Math.ceil(state.acceptSecondsLeft)} seconds to accept`}>
            <svg viewBox="0 0 60 60" width="60" height="60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="var(--surface-3)" strokeWidth="5" />
              <circle
                cx="30" cy="30" r="26" fill="none"
                stroke={pct > 0.35 ? 'var(--brand-bright)' : 'var(--red)'}
                strokeWidth="5" strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct)}
                transform="rotate(-90 30 30)"
              />
            </svg>
            <span className="offer-count">{Math.ceil(state.acceptSecondsLeft)}</span>
          </span>

          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 26, fontWeight: 780, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {formatGHS(job.earnings)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              your share of {formatGHS(job.fare)} · {job.paymentLabel}
            </div>
          </span>

          <span className="ride-art" style={{ background: 'var(--gold-soft)', color: 'var(--gold)' }}>
            <ProductIcon id={job.product} size={22} />
          </span>
        </div>

        <div className="offer-meta">
          <span><strong>{job.pickupMinutes} min</strong> to pickup</span>
          <span><strong>{job.tripMinutes} min</strong> trip</span>
          <span><strong>{job.trip.distanceKm.toFixed(1)} km</strong></span>
        </div>

        <JourneyRail
          from={job.pickup.name}
          fromNote={`${job.pickup.area} · ${job.toPickup.distanceKm.toFixed(1)} km away`}
          to={job.dropoff.name}
          toNote={job.dropoff.area}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span className="rating-inline">
            <IconStarFilled width={13} height={13} />
            {job.riderRating.toFixed(1)}
          </span>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            {job.riderName}
            {job.note ? ` — “${job.note}”` : ''}
          </span>
        </div>

        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'driverDecline' })}>
            Decline
          </button>
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'driverAccept' })}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function DrivingSheet() {
  const { state, dispatch } = useRyde();
  const job = state.driverJob;
  if (!job) return null;

  const toPickup = state.driverPhase === 'to_pickup';
  const waiting = state.driverPhase === 'waiting';

  const minutes = toPickup ? job.pickupMinutes : job.tripMinutes;
  const remaining = Math.max(1, Math.ceil(minutes * (1 - state.driverProgress)));

  const headline = waiting
    ? { big: 'Here', unit: '', sub: `Waiting for ${job.riderName} at ${job.pickup.name}` }
    : toPickup
      ? { big: `${remaining}`, unit: 'min to pickup', sub: job.pickup.name }
      : { big: `${remaining}`, unit: 'min to dropoff', sub: job.dropoff.name };

  const nextRoad = useMemo(() => {
    const leg = toPickup ? job.toPickup : job.trip;
    const cum = leg.directions;
    const done = state.driverProgress * leg.distanceKm;
    let travelled = 0;
    for (const step of cum) {
      travelled += step.km;
      if (travelled > done) return step;
    }
    return cum[cum.length - 1];
  }, [job, toPickup, state.driverProgress]);

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        {!waiting && nextRoad && (
          <div className="nav-banner">
            <IconRoute width={18} height={18} />
            <span>
              Continue on <strong>{nextRoad.road}</strong>
            </span>
          </div>
        )}

        <div className="eta-hero">
          <span className="eta-num">{headline.big}</span>
          <span className="eta-unit">{headline.unit}</span>
          <span className="eta-unit" style={{ marginLeft: 'auto', color: 'var(--gold)' }}>
            {formatGHS(job.earnings)}
          </span>
        </div>
        <p className="sheet-sub">{headline.sub}</p>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${state.driverProgress * 100}%` }} />
        </div>

        <div className="driver-card">
          <span className="avatar">{initials(job.riderName)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16, letterSpacing: '-0.02em' }}>{job.riderName}</strong>
              <span className="rating-inline">
                <IconStarFilled width={13} height={13} />
                {job.riderRating.toFixed(1)}
              </span>
            </span>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {PRODUCT_BY_ID[job.product].name} · {job.paymentLabel}
            </div>
            {job.note && (
              <div style={{ fontSize: 12.5, color: 'var(--gold)', marginTop: 4 }}>“{job.note}”</div>
            )}
          </span>
        </div>

        <div className="action-grid">
          <button
            className="action-tile"
            onClick={() => dispatch({ type: 'toast', message: `Message sent to ${job.riderName}` })}
          >
            <IconChat width={19} height={19} />
            Message
          </button>
          <button
            className="action-tile"
            onClick={() => dispatch({ type: 'toast', message: `Calling ${job.riderName}…` })}
          >
            <IconPhone width={19} height={19} />
            Call
          </button>
          <button className="action-tile danger" onClick={() => dispatch({ type: 'sheet', sheet: 'safety' })}>
            <IconShield width={19} height={19} />
            Safety
          </button>
        </div>

        {waiting ? (
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'driverPhase', phase: 'on_trip' })}>
            Start trip
          </button>
        ) : toPickup ? (
          <button
            className="btn btn-dark"
            onClick={() => dispatch({ type: 'driverPhase', phase: 'waiting' })}
          >
            I've arrived at pickup
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => dispatch({ type: 'driverComplete' })}>
            End trip
          </button>
        )}
      </div>
    </div>
  );
}

function SummarySheet() {
  const { state, dispatch } = useRyde();
  const last = state.driverLog[0];

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <h2 className="sheet-title">Trip complete</h2>
        <p className="sheet-sub">
          {last ? `${last.rider} dropped at ${last.dropoff}` : 'Nice work'}
        </p>

        <div className="earned-card">
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)', fontWeight: 600, letterSpacing: '0.04em' }}>
            YOU EARNED
          </div>
          <div className="balance-amount">{formatGHS(state.lastEarned + state.lastBonus)}</div>
          {last && (
            <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 4 }}>
              {last.km.toFixed(1)} km · {last.minutes} min
              {state.lastBonus > 0 && ` · includes ${formatGHS(state.lastBonus)} challenge bonus`}
            </div>
          )}
        </div>

        <div className="rated">
          <span className="list-sub">{state.driverStars[0] === 5 ? 'The rider gave you' : 'The rider rated this trip'}</span>
          <span className="rated-stars">
            {[1, 2, 3, 4, 5].map((n) => (
              <IconStarFilled
                key={n}
                width={16}
                height={16}
                color={n <= (state.driverStars[0] ?? 5) ? 'var(--gold)' : 'var(--surface-3)'}
              />
            ))}
          </span>
          {state.fiveStarStreak > 0 && (
            <span className="list-sub">{state.fiveStarStreak} five-star trips in a row</span>
          )}
        </div>

        <TodayStats />
        <RewardsRow />

        <button className="btn btn-primary" onClick={() => dispatch({ type: 'driverDismissSummary' })}>
          Back online
        </button>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={() => dispatch({ type: 'driverOnline', on: false })}>
            Take a break
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function DriverSheet() {
  const { state } = useRyde();

  switch (state.driverPhase) {
    case 'offline':
      return <OfflineSheet />;
    case 'idle':
      return <SearchingSheet />;
    case 'incoming':
      return <IncomingSheet />;
    case 'to_pickup':
    case 'waiting':
    case 'on_trip':
      return <DrivingSheet />;
    case 'summary':
      return <SummarySheet />;
    default:
      return null;
  }
}
