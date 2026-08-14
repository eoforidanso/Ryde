import { useState, type ReactNode } from 'react';
import { PAYMENT_METHODS } from '../data/products';
import { formatGHS } from '../lib/pricing';
import { useRyde } from '../store/RydeStore';
import {
  IconAlert, IconChat, IconPhone, IconShare, IconShield, IconUsers, IconX,
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

function FareModal() {
  const { state, quote, total } = useRyde();
  if (!quote) return null;
  return (
    <Modal title="Fare breakdown" sub={`${quote.product.name} · ${quote.distanceKm.toFixed(1)} km`}>
      <div className="card" style={{ padding: '6px 16px 10px' }}>
        {quote.breakdown.map((b) => (
          <div className="kv" key={b.label}>
            <span className="k">{b.label}</span>
            <span className="v">{formatGHS(b.amount)}</span>
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
      <p style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 0 }}>
        Fares are quoted upfront. If the route changes significantly during the trip, the final
        fare is recalculated and shown on your receipt.
      </p>
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
    default:
      return null;
  }
}
