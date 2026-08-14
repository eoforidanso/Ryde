import { useState, type ReactNode } from 'react';
import { PAYMENT_METHODS } from '../data/products';
import { formatGHS } from '../lib/pricing';
import { explainFare } from '../lib/fairness';
import * as api from '../lib/api';
import {
  POINTS_PER_CEDI, REDEMPTIONS, SPLIT_CONTACTS, TOP_UP_AMOUNTS, TOP_UP_THRESHOLDS, splitFare,
} from '../lib/loyalty';
import { leaderboard, tierFor, weeklyChallenges } from '../lib/rewards';
import { COMPANY, DEPARTMENT_BY_ID, ME, TRIP_PURPOSES, checkPolicy } from '../data/business';
import { driverStats, useRyde } from '../store/RydeStore';
import {
  IconAlert, IconBuilding, IconChat, IconGift, IconInfo, IconPhone, IconRepeat, IconShare,
  IconShield, IconTarget, IconTrendDown, IconTrendUp, IconTrophy, IconUser, IconUsers, IconX,
} from './Icons';

function Modal({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { dispatch } = useRyde();
  return (
    <>
      <div className="modal-scrim" onClick={() => dispatch({ type: 'sheet', sheet: null })} />
      <div className="sheet" style={{ zIndex: 22 }}>
        <div className="sheet-grab" />
        <div className="sheet-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <h2 className="sheet-title">{title}</h2>
              {sub && <p className="sheet-sub" style={{ marginBottom: 0 }}>{sub}</p>}
            </div>
            <button className="icon-btn" onClick={() => dispatch({ type: 'sheet', sheet: null })} aria-label="Close">
              <IconX />
            </button>
          </div>
          {children}
        </div>
      </div>
    </>
  );
}

function PaymentModal() {
  const { state, dispatch } = useRyde();
  return (
    <Modal title="Payment" sub="Mobile money is settled the moment your trip ends">
      {PAYMENT_METHODS.map((m) => (
        <button
          key={m.id}
          className={`pay-tile ${state.payment === m.id ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'payment', id: m.id })}
        >
          <span className="pay-swatch" style={{ background: m.tint }}>
            {m.id === 'cash' ? 'GH₵' : m.label.slice(0, 3).toUpperCase()}
          </span>
          <span style={{ flex: 1 }}>
            <div style={{ fontWeight: 650, fontSize: 15 }}>{m.label}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{m.detail}</div>
          </span>
          {state.payment === m.id && (
            <span style={{ color: 'var(--brand-bright)', fontWeight: 800, fontSize: 13 }}>Selected</span>
          )}
        </button>
      ))}
      <div style={{ paddingTop: 8 }}>
        <button
          className="btn btn-dark"
          onClick={() => dispatch({ type: 'toast', message: 'Add a new payment method' })}
        >
          Add payment method
        </button>
      </div>
    </Modal>
  );
}

/**
 * Why this price.
 *
 * The breakdown answers "what am I paying for"; the factors answer "why is it
 * this much today", which is the question that actually makes people angry.
 * Both are generated from the quote itself, so neither can flatter the fare.
 */
function FareModal() {
  const { state, quote, total, traffic, rules, forecast } = useRyde();
  if (!quote) return null;

  const factors = explainFare(quote, traffic, state.now);

  return (
    <Modal title="Why this price?" sub={`${quote.product.name} · ${quote.distanceKm.toFixed(1)} km`}>
      <div className="card" style={{ padding: '6px 16px 10px' }}>
        {quote.breakdown.map((b) => (
          <div className="kv" key={b.label}>
            <span className="k">{b.label}</span>
            <span className="v" style={b.amount < 0 ? { color: 'var(--brand-bright)' } : undefined}>
              {b.amount < 0 ? `−${formatGHS(Math.abs(b.amount))}` : formatGHS(b.amount)}
            </span>
          </div>
        ))}
        {state.promoDiscount > 0 && (
          <div className="kv">
            <span className="k">Promo {state.promo}</span>
            <span className="v" style={{ color: 'var(--brand-bright)' }}>−{formatGHS(state.promoDiscount)}</span>
          </div>
        )}
        <div className="kv total">
          <span className="k">Total</span>
          <span className="v">{formatGHS(total)}</span>
        </div>
      </div>

      <div className="section-label">What moved this fare</div>
      {factors.map((f) => (
        <div key={f.label} className={`factor ${f.tone}`}>
          <span className="factor-mark">
            {f.tone === 'up' ? <IconTrendUp width={15} height={15} />
              : f.tone === 'down' ? <IconTrendDown width={15} height={15} />
                : <IconInfo width={15} height={15} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="factor-title">{f.label}</span>
            <span className="factor-sub">{f.detail}</span>
          </span>
          {f.amount !== undefined && (
            <span className="factor-amount">
              {f.amount < 0 ? '−' : ''}{formatGHS(Math.abs(f.amount))}
            </span>
          )}
        </div>
      ))}

      {forecast && (
        <div className={`fare-alert ${forecast.direction === 'falling' ? 'good' : 'warn'}`} style={{ marginTop: 12 }}>
          <span className="fare-alert-icon">
            {forecast.direction === 'falling'
              ? <IconTrendDown width={17} height={17} />
              : <IconTrendUp width={17} height={17} />}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="fare-alert-title">{forecast.headline}</span>
            <span className="fare-alert-sub">{forecast.detail}</span>
          </span>
        </div>
      )}

      <div className="promise">
        <IconShield color="var(--brand-bright)" style={{ flex: 'none' }} />
        <span>
          {rules.capReason}. Fares are quoted upfront — if the route changes significantly
          during the trip, the new fare is shown on your receipt.
        </span>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Pickup zones                                                        */
/* ------------------------------------------------------------------ */

/** Every pickup point worth considering, with the wait each one predicts. */
function PickupModal() {
  const { state, dispatch, advice } = useRyde();
  const options = [advice.current, ...advice.zones];

  return (
    <Modal
      title="Best pickup spots"
      sub="Predicted from where drivers are right now and how long you'd walk"
    >
      {options.map((z) => {
        const chosen = z.id === state.pickup.id;
        return (
          <button
            key={z.id}
            className={`zone-option ${chosen ? 'on' : ''}`}
            onClick={() => {
              dispatch({ type: 'setPlace', field: 'pickup', place: z.place });
              dispatch({ type: 'sheet', sheet: null });
            }}
          >
            <span className="zone-wait">
              <strong>{z.waitMinutes}</strong>
              <span>min</span>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="zone-title">{z.name}</span>
              <span className="zone-sub">
                {z.current ? 'Where you are now' : `${z.walkMinutes} min walk · ${z.reason}`}
              </span>
              <span className="zone-sub" style={{ color: 'var(--muted)' }}>
                Driver {z.driverMinutes} min away
                {z.driversNearby > 0 ? ` · ${z.driversNearby} nearby` : ''}
              </span>
            </span>
            {chosen && <span className="badge green">Current</span>}
          </button>
        );
      })}
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        The wait is the later of the two — your walk and the driver's drive — because both have
        to happen before you are moving.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Trip profile — personal or company                                  */
/* ------------------------------------------------------------------ */

function ProfileModal() {
  const { state, dispatch, total } = useRyde();
  const policy = checkPolicy(ME, total, state.businessSessionSpend);
  const business = state.tripProfile === 'business';

  return (
    <Modal title="Trip profile" sub="Who pays for this ride">
      <button
        className={`pay-tile ${!business ? 'on' : ''}`}
        onClick={() => dispatch({ type: 'tripProfile', profile: 'personal' })}
      >
        <span className="list-icon accent" style={{ width: 34, height: 34 }}><IconUser width={16} height={16} /></span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>Personal</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Paid from your wallet · earns points</div>
        </span>
      </button>

      <button
        className={`pay-tile ${business ? 'on' : ''}`}
        onClick={() => dispatch({ type: 'tripProfile', profile: 'business' })}
      >
        <span className="list-icon gold" style={{ width: 34, height: 34 }}><IconBuilding width={16} height={16} /></span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 650, fontSize: 15 }}>{COMPANY.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{COMPANY.billing} · {DEPARTMENT_BY_ID[ME.departmentId].code}</div>
        </span>
      </button>

      {business && (
        <>
          <div className={`policy-note ${policy.withinPolicy ? '' : 'over'}`}>
            <IconAlert width={15} height={15} style={{ flex: 'none' }} />
            <span>{policy.message}</span>
          </div>

          <div className="limit-bar">
            <span
              className="limit-fill"
              style={{ width: `${Math.min(100, (policy.spent / policy.limit) * 100)}%` }}
            />
          </div>
          <div className="limit-legend">
            <span>{formatGHS(policy.spent)} used</span>
            <span>{formatGHS(policy.limit)} monthly limit</span>
          </div>

          <div className="section-label">Trip purpose</div>
          <div className="quick-chips">
            {TRIP_PURPOSES.map((p) => (
              <button
                key={p}
                className={`quick-chip ${state.tripPurpose === p ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'tripPurpose', purpose: p })}
              >
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Split fare                                                          */
/* ------------------------------------------------------------------ */

function SplitModal() {
  const { state, dispatch, total } = useRyde();
  const picked = state.splitWith;
  const share = splitFare(total, picked.length);

  return (
    <Modal title="Split this fare" sub="Everyone is asked to pay in the Ryde app — no cash at the kerb">
      {SPLIT_CONTACTS.map((c) => {
        const on = picked.includes(c.id);
        return (
          <button
            key={c.id}
            className={`pay-tile ${on ? 'on' : ''}`}
            onClick={() => dispatch({ type: 'toggleSplit', contactId: c.id })}
          >
            <span className="avatar" style={{ width: 34, height: 34, fontSize: 12 }}>
              {c.name.split(' ').map((n) => n[0]).join('')}
            </span>
            <span style={{ flex: 1 }}>
              <div style={{ fontWeight: 650, fontSize: 15 }}>{c.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{c.msisdn}</div>
            </span>
            {on && <span style={{ color: 'var(--brand-bright)', fontWeight: 800, fontSize: 13 }}>
              {formatGHS(share.each)}
            </span>}
          </button>
        );
      })}

      <div className="card" style={{ padding: '10px 16px' }}>
        <div className="kv">
          <span className="k">Fare</span>
          <span className="v">{formatGHS(total)}</span>
        </div>
        <div className="kv">
          <span className="k">Split {picked.length + 1} ways</span>
          <span className="v">{formatGHS(share.each)} each</span>
        </div>
        <div className="kv total">
          <span className="k">You pay</span>
          <span className="v">{formatGHS(picked.length ? share.yours : total)}</span>
        </div>
      </div>
      {picked.length > 0 && (
        <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
          Cedis do not divide evenly, so you carry the odd pesewas rather than everyone being
          rounded up.
        </p>
      )}

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'clearSplit' })}>
          Clear
        </button>
        <button className="btn btn-primary" onClick={() => dispatch({ type: 'sheet', sheet: null })}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Auto top up                                                         */
/* ------------------------------------------------------------------ */

function AutoTopUpModal() {
  const { state, dispatch } = useRyde();
  const [rule, setRule] = useState(state.autoTopUp);

  return (
    <Modal
      title="Auto top up"
      sub="Keeps enough in Ryde Cash that a trip never fails at the kerb"
    >
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="list-icon accent"><IconRepeat /></span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 650 }}>Top up automatically</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>Charged to MTN MoMo 024 •••• 418</div>
        </span>
        <button
          className={`switch ${rule.on ? 'on' : ''}`}
          onClick={() => setRule((r) => ({ ...r, on: !r.on }))}
          aria-label="Toggle auto top up"
          aria-pressed={rule.on}
        />
      </div>

      <div className="section-label">When my balance falls below</div>
      <div className="tip-row">
        {TOP_UP_THRESHOLDS.map((t) => (
          <button
            key={t}
            className={`tip ${rule.threshold === t ? 'on' : ''}`}
            disabled={!rule.on}
            onClick={() => setRule((r) => ({ ...r, threshold: t }))}
          >
            GH₵{t}
          </button>
        ))}
      </div>

      <div className="section-label">Top up by</div>
      <div className="tip-row">
        {TOP_UP_AMOUNTS.map((a) => (
          <button
            key={a}
            className={`tip ${rule.amount === a ? 'on' : ''}`}
            disabled={!rule.on}
            onClick={() => setRule((r) => ({ ...r, amount: a }))}
          >
            GH₵{a}
          </button>
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        {rule.on
          ? `We will add ${formatGHS(rule.amount)} whenever your balance drops under ${formatGHS(rule.threshold)}. You will get a MoMo prompt to approve the first one.`
          : 'With this off, a low balance means picking a payment method at the end of the trip.'}
      </p>

      <button className="btn btn-primary" onClick={() => dispatch({ type: 'autoTopUp', rule })}>
        Save rule
      </button>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Ryde Points                                                         */
/* ------------------------------------------------------------------ */

function PointsModal() {
  const { state, dispatch } = useRyde();
  // Redemption moves money into the wallet. When the payments service holds
  // the balance, that credit has to be issued there, not invented here.
  const canRedeem = !api.isLive();

  return (
    <Modal title="Ryde Points" sub={`${state.points.toLocaleString()} points · earn ${POINTS_PER_CEDI} per cedi you spend`}>
      {!canRedeem && (
        <div className="policy-note">
          <IconInfo width={15} height={15} style={{ flex: 'none' }} />
          <span>
            Points keep accruing, but redeeming credits your Ryde Cash — that has to be issued by
            the payments service, which does not carry points yet.
          </span>
        </div>
      )}
      {REDEMPTIONS.map((r) => {
        const affordable = canRedeem && state.points >= r.points;
        return (
          <button
            key={r.points}
            className="list-row"
            disabled={!affordable}
            style={affordable ? undefined : { opacity: 0.45 }}
            onClick={() => dispatch({ type: 'redeem', points: r.points, credit: r.credit })}
          >
            <span className="list-icon gold"><IconGift /></span>
            <span className="list-main">
              <span className="list-title">{r.label}</span>
              <span className="list-sub">
                {r.points.toLocaleString()} points
                {state.points >= r.points ? '' : ` · ${(r.points - state.points).toLocaleString()} to go`}
              </span>
            </span>
            <span className="list-meta" style={{ color: affordable ? 'var(--brand-bright)' : 'var(--muted)' }}>
              {affordable ? 'Redeem' : 'Locked'}
            </span>
          </button>
        );
      })}
      <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
        Bigger redemptions are worth more per point — GH₵30 costs 2,500 points, where three
        GH₵5 credits would cost 1,500 for GH₵15.
      </p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Driver rewards                                                      */
/* ------------------------------------------------------------------ */

function RewardsModal() {
  const { state } = useRyde();
  const stats = driverStats(state);
  const standing = tierFor(stats.weekTrips, stats.rating);
  const challenges = weeklyChallenges(stats);
  const zone = 'Shiashie';
  const board = leaderboard(zone, stats);

  const unit = (c: (typeof challenges)[number]) =>
    c.unit === 'ghs' ? formatGHS(c.progress).replace('.00', '') : Math.floor(c.progress);

  return (
    <Modal title="Rewards" sub={`${stats.weekTrips} trips this week · ${stats.rating.toFixed(2)} rating`}>
      <div className="tier-card" style={{ borderColor: standing.tier.colour }}>
        <span className="tier-badge" style={{ background: standing.tier.colour }}>
          <IconTrophy width={20} height={20} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 750, letterSpacing: '-0.02em' }}>
            {standing.tier.name}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{standing.tier.perk}</div>
        </span>
      </div>

      {standing.next && (
        <>
          <div className="progress-track" style={{ marginTop: 12 }}>
            <div className="progress-fill" style={{ width: `${standing.progress * 100}%` }} />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 8 }}>
            {standing.ratingBlocked
              ? `You have the trips for ${standing.next.name} — it needs a ${standing.next.minRating.toFixed(2)} rating, and yours is ${stats.rating.toFixed(2)}.`
              : `${standing.tripsToNext} more trips for ${standing.next.name} — ${standing.next.perk.toLowerCase()}.`}
          </p>
        </>
      )}

      <div className="section-label">This week's challenges</div>
      {challenges.map((c) => (
        <div key={c.id} className="challenge">
          <span className={`list-icon ${c.done ? 'accent' : 'gold'}`}>
            <IconTarget width={18} height={18} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="challenge-head">
              <span className="list-title">{c.title}</span>
              <span className="challenge-reward">+{formatGHS(c.reward).replace('.00', '')}</span>
            </span>
            <span className="list-sub">{c.done ? 'Paid into your earnings' : c.detail}</span>
            <span className="progress-track" style={{ margin: '8px 0 0' }}>
              <span
                className="progress-fill"
                style={{ width: `${Math.min(100, (c.progress / c.target) * 100)}%` }}
              />
            </span>
            <span className="challenge-count">
              {unit(c)} of {c.unit === 'ghs' ? `GH₵${c.target}` : c.target}
            </span>
          </span>
        </div>
      ))}

      <div className="section-label">Leaderboard — {zone}</div>
      {board.slice(0, 6).map((row) => (
        <div key={row.name} className={`leader ${row.you ? 'you' : ''}`}>
          <span className="leader-rank">{row.rank}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="list-title">{row.name}</span>
            <span className="list-sub">{row.trips} trips this week</span>
          </span>
          <span className="list-meta" style={{ color: row.you ? 'var(--brand-bright)' : undefined }}>
            {formatGHS(row.earnings).replace('.00', '')}
          </span>
        </div>
      ))}
      {board.findIndex((r) => r.you) > 5 && (
        <div className="leader you">
          <span className="leader-rank">{board.find((r) => r.you)!.rank}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="list-title">You</span>
            <span className="list-sub">{stats.weekTrips} trips this week</span>
          </span>
          <span className="list-meta" style={{ color: 'var(--brand-bright)' }}>
            {formatGHS(stats.weekEarnings).replace('.00', '')}
          </span>
        </div>
      )}
    </Modal>
  );
}

function SafetyModal() {
  const { state, dispatch } = useRyde();
  const rows = [
    {
      icon: <IconShare />,
      title: 'Share live trip',
      sub: 'Send your route and driver details to a contact',
      action: () => dispatch({ type: 'toast', message: 'Live trip link sent to Kojo and Mum' }),
    },
    {
      icon: <IconPhone />,
      title: 'Call Ryde safety line',
      sub: 'Trained agents, 24/7, based in Accra',
      action: () => dispatch({ type: 'toast', message: 'Connecting to Ryde Safety…' }),
    },
    {
      icon: <IconAlert />,
      title: 'Emergency — call 191',
      sub: 'Ghana Police Service; your location is shared automatically',
      action: () => dispatch({ type: 'toast', message: 'Emergency services would be dialled here' }),
    },
    {
      icon: <IconUsers />,
      title: 'Trusted contacts',
      sub: 'Kojo Mensah · Mum · Akosua',
      action: () => dispatch({ type: 'toast', message: 'Manage trusted contacts' }),
    },
  ];

  return (
    <Modal
      title="Safety toolkit"
      sub={state.driver ? `Trip with ${state.driver.name} · ${state.driver.plate}` : 'Available on every trip'}
    >
      {rows.map((r) => (
        <button key={r.title} className="list-row" onClick={r.action}>
          <span className={`list-icon ${r.title.startsWith('Emergency') ? '' : 'accent'}`}
                style={r.title.startsWith('Emergency') ? { background: 'var(--red-soft)', color: '#ff8a84' } : undefined}>
            {r.icon}
          </span>
          <span className="list-main">
            <span className="list-title">{r.title}</span>
            <span className="list-sub">{r.sub}</span>
          </span>
        </button>
      ))}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, padding: 12, borderRadius: 14, background: 'var(--brand-soft)' }}>
        <IconShield color="var(--brand-bright)" style={{ flex: 'none' }} />
        <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>
          Every Ryde driver is verified with a Ghana Card, DVLA licence check and vehicle inspection.
        </span>
      </div>
    </Modal>
  );
}

const QUICK_MESSAGES = [
  'I dey come — one minute',
  'I am at the gate',
  'Please call me when you arrive',
  'Meet me at the junction',
  'Sorry, small delay',
];

function ContactModal() {
  const { state } = useRyde();
  const [sent, setSent] = useState<string[]>([]);
  const driverName = state.driver?.name.split(' ')[0] ?? 'your driver';

  return (
    <Modal title={`Message ${driverName}`} sub="Tap a quick reply — no typing needed">
      {sent.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {sent.map((m, i) => (
            <div
              key={i}
              style={{
                marginLeft: 'auto', maxWidth: '80%', marginBottom: 6, padding: '9px 13px',
                borderRadius: '14px 14px 4px 14px', background: 'var(--brand)', color: '#04120b',
                fontSize: 14, fontWeight: 600, width: 'fit-content',
              }}
            >
              {m}
            </div>
          ))}
        </div>
      )}
      {QUICK_MESSAGES.map((m) => (
        <button key={m} className="list-row" onClick={() => setSent((s) => [...s, m])}>
          <span className="list-icon accent"><IconChat /></span>
          <span className="list-main">
            <span className="list-title">{m}</span>
          </span>
        </button>
      ))}
    </Modal>
  );
}

const SLOTS = ['In 30 minutes', 'Today, 18:30', 'Tomorrow, 04:45 — airport run', 'Tomorrow, 07:15'];

function ScheduleModal() {
  const { state, dispatch } = useRyde();
  return (
    <Modal title="Schedule a ride" sub="We will match a driver 15 minutes before pickup">
      {SLOTS.map((s) => (
        <button
          key={s}
          className={`pay-tile ${state.scheduledFor === s ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'schedule', when: s })}
        >
          <span className="list-icon accent" style={{ width: 34, height: 34 }}>
            <IconShield width={16} height={16} />
          </span>
          <span style={{ flex: 1, fontWeight: 650 }}>{s}</span>
        </button>
      ))}
    </Modal>
  );
}

export default function Modals() {
  const { state } = useRyde();
  switch (state.sheet) {
    case 'payment':
      return <PaymentModal />;
    case 'fare':
      return <FareModal />;
    case 'safety':
      return <SafetyModal />;
    case 'contact':
      return <ContactModal />;
    case 'schedule':
      return <ScheduleModal />;
    case 'pickup':
      return <PickupModal />;
    case 'profile':
      return <ProfileModal />;
    case 'split':
      return <SplitModal />;
    case 'autoTopUp':
      return <AutoTopUpModal />;
    case 'points':
      return <PointsModal />;
    case 'rewards':
      return <RewardsModal />;
    default:
      return null;
  }
}
