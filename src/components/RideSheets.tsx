import { useMemo, type ReactNode } from 'react';
import { PLACE_BY_ID, SAVED, type Place } from '../data/places';
import { PAYMENT_METHODS, PRODUCT_BY_ID } from '../data/products';
import { formatGHS, formatGHSShort } from '../lib/pricing';
import { haversineKm } from '../data/network';
import * as api from '../lib/api';
import { useRyde } from '../store/RydeStore';
import { ProductIcon } from './productIcon';
import {
  IconBriefcase, IconCalendar, IconChat, IconChevron, IconClock, IconHome, IconLightning,
  IconPhone, IconPin, IconSearch, IconShare, IconShield, IconStar, IconStarFilled, IconX,
} from './Icons';

function initials(name: string) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('');
}

/* ------------------------------------------------------------------ */
/* Idle — the launcher                                                 */
/* ------------------------------------------------------------------ */

export function IdleSheet() {
  const { state, dispatch, traffic } = useRyde();

  const nearby = useMemo(
    () => state.fleet.filter((d) => haversineKm(d, state.pickup) < 3.2).length,
    [state.fleet, state.pickup],
  );

  const shortcut = (place: Place, icon: ReactNode, label: string, sub: string) => (
    <button
      key={label}
      className="list-row"
      onClick={() => dispatch({ type: 'setPlace', field: 'dropoff', place })}
    >
      <span className="list-icon accent">{icon}</span>
      <span className="list-main">
        <span className="list-title">{label}</span>
        <span className="list-sub">{sub}</span>
      </span>
      <IconChevron width={17} height={17} color="var(--muted)" />
    </button>
  );

  const hour = state.now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <h2 className="sheet-title">{greeting}, Ama</h2>
        <p className="sheet-sub">
          {nearby} {nearby === 1 ? 'driver' : 'drivers'} near {state.pickup.area} · {traffic.label.toLowerCase()}
        </p>

        <button
          className="field-stack"
          style={{ display: 'block', width: '100%', marginBottom: 14 }}
          onClick={() => dispatch({ type: 'openSearch', field: 'dropoff' })}
        >
          <span className="field">
            <IconSearch color="var(--brand-bright)" />
            <span className="field-value dim">Where are you going?</span>
          </span>
        </button>

        <div className="quick-chips">
          <button className="quick-chip" onClick={() => dispatch({ type: 'sheet', sheet: 'schedule' })}>
            <IconCalendar width={14} height={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Schedule
          </button>
          <button
            className="quick-chip"
            onClick={() => { dispatch({ type: 'product', id: 'okada' }); dispatch({ type: 'openSearch', field: 'dropoff' }); }}
          >
            <IconLightning width={14} height={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Okada
          </button>
          <button
            className="quick-chip"
            onClick={() => { dispatch({ type: 'product', id: 'aboboya' }); dispatch({ type: 'openSearch', field: 'dropoff' }); }}
          >
            Send a parcel
          </button>
          <button className="quick-chip" onClick={() => dispatch({ type: 'openSearch', field: 'pickup' })}>
            Change pickup
          </button>
        </div>

        {shortcut(SAVED.home, <IconHome />, 'Home', SAVED.home.area)}
        {shortcut(SAVED.work, <IconBriefcase />, 'Work', SAVED.work.area)}
        {shortcut(PLACE_BY_ID['kia'], <IconPin />, 'Kotoka Airport', 'Terminal 3 · pickup at Arrivals')}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Choosing — ride options                                             */
/* ------------------------------------------------------------------ */

export function ChoosingSheet() {
  const { state, dispatch, quotes, quote, total, traffic } = useRyde();
  const payment = PAYMENT_METHODS.find((p) => p.id === state.payment)!;

  /**
   * Ask the payments service to price and record the trip before dispatching a
   * driver. The server's fare is what will be charged; if the service isn't
   * configured we fall through to the local estimate.
   */
  const requestRide = async () => {
    if (!state.route || !state.dropoff) return;
    dispatch({ type: 'request' });
    if (!api.isLive()) return;

    try {
      const { tripId } = await api.quoteTrip({
        product: state.productId,
        pickup: { name: state.pickup.name, lat: state.pickup.lat, lng: state.pickup.lng },
        dropoff: { name: state.dropoff.name, lat: state.dropoff.lat, lng: state.dropoff.lng },
        distanceM: Math.round(state.route.distanceKm * 1000),
        durationS: Math.round((quote?.minutes ?? 15) * 60),
        surgeBp: Math.round((quote?.surge ?? 1) * 10000),
        paymentMethod: api.settlementFor(state.payment),
        promoCode: state.promo ?? undefined,
      });
      // No startTrip call here by design: accepting a trip is a driver action,
      // and the rider's token is refused by that endpoint. In this demo the
      // server assigns a driver itself (DEMO_AUTO_ASSIGN); in production the
      // driver app calls /trips/:id/start.
      dispatch({ type: 'serverTrip', tripId });
    } catch (err) {
      dispatch({ type: 'cancel' });
      dispatch({ type: 'toast', message: (err as Error).message });
    }
  };

  if (!state.route || !state.dropoff) return null;

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 className="sheet-title">Choose a ride</h2>
            <p className="sheet-sub" style={{ marginBottom: 0 }}>
              {state.route.distanceKm.toFixed(1)} km · {state.dropoff.name}
            </p>
          </div>
          <button className="icon-btn" onClick={() => dispatch({ type: 'clearDropoff' })} aria-label="Clear destination">
            <IconX />
          </button>
        </div>

        {traffic.surge > 1 && (
          <div
            className="chip warn"
            style={{ marginBottom: 12, backdropFilter: 'none', background: 'var(--gold-soft)', border: '1px solid rgba(242,193,78,0.28)' }}
          >
            <span className="dot" />
            Fares are {traffic.surge.toFixed(1)}× — {traffic.reason.toLowerCase()}
          </div>
        )}

        <div className="ride-list">
          {quotes.map((q) => (
            <button
              key={q.product.id}
              className={`ride ${state.productId === q.product.id ? 'selected' : ''} ${q.available ? '' : 'unavailable'}`}
              onClick={() => dispatch({ type: 'product', id: q.product.id })}
            >
              <span className="ride-art">
                <ProductIcon id={q.product.id} />
              </span>
              <span className="ride-main">
                <span className="ride-name">
                  <span className="label">{q.product.name}</span>
                  {q.product.badge && (
                    <span className={`badge ${q.product.badge === 'Cheapest' ? 'green' : ''}`}>{q.product.badge}</span>
                  )}
                </span>
                <span className="ride-tag">
                  {q.pickupMinutes} min away · {q.minutes} min trip
                </span>
              </span>
              <span className="ride-price">
                <span className="ride-fare">{formatGHSShort(q.fare)}</span>
                {q.surge > 1 && <span className="ride-strike">{formatGHSShort(q.baseFare)}</span>}
              </span>
            </button>
          ))}
        </div>

        <button className="opt-row" onClick={() => dispatch({ type: 'sheet', sheet: 'payment' })}>
          <span className="pay-swatch" style={{ background: payment.tint }}>
            {payment.id === 'cash' ? 'GH₵' : payment.label.slice(0, 3).toUpperCase()}
          </span>
          <span className="label">{payment.label}</span>
          <span className="value">{payment.detail}</span>
          <IconChevron width={16} height={16} color="var(--muted)" />
        </button>

        <button className="opt-row" onClick={() => dispatch({ type: 'sheet', sheet: 'fare' })}>
          <IconClock width={18} height={18} color="var(--muted)" />
          <span className="label">Fare breakdown</span>
          <span className="value">{quote ? formatGHS(total) : '—'}</span>
          <IconChevron width={16} height={16} color="var(--muted)" />
        </button>

        <button
          className="opt-row"
          onClick={() => dispatch({ type: 'promo', code: state.promo ? '' : 'RYDE10' })}
        >
          <IconStar width={18} height={18} color="var(--gold)" />
          <span className="label">{state.promo ? `Promo ${state.promo}` : 'Add promo code'}</span>
          <span className="value">{state.promoDiscount ? `−${formatGHS(state.promoDiscount)}` : 'RYDE10'}</span>
          <IconChevron width={16} height={16} color="var(--muted)" />
        </button>

        <div style={{ paddingTop: 14 }}>
          <button className="btn btn-primary" onClick={requestRide}>
            Request {PRODUCT_BY_ID[state.productId].name} · {formatGHS(total)}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Matching                                                            */
/* ------------------------------------------------------------------ */

export function MatchingSheet() {
  const { state, dispatch, quote } = useRyde();
  const dots = Math.floor(state.progress * 3) % 3;

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <div className="matching-orb">
          <span className="ring" />
          <span className="ring" />
          <span className="ring" />
          <span className="matching-core">
            <ProductIcon id={state.productId} size={24} />
          </span>
        </div>

        <h2 className="sheet-title" style={{ textAlign: 'center' }}>
          Finding your {PRODUCT_BY_ID[state.productId].name.replace('Ryde ', '')}
          {'.'.repeat(dots + 1)}
        </h2>
        <p className="sheet-sub" style={{ textAlign: 'center' }}>
          Contacting drivers near {state.pickup.area} · usually under {quote?.pickupMinutes ?? 4} min
        </p>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${state.progress * 100}%` }} />
        </div>

        <button className="btn btn-ghost" onClick={() => dispatch({ type: 'cancel' })}>
          Cancel request
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Active trip                                                         */
/* ------------------------------------------------------------------ */

export function TripSheet() {
  const { state, dispatch, quote } = useRyde();
  const { driver, phase, progress } = state;
  if (!driver) return null;

  const pickupMin = quote?.pickupMinutes ?? 4;
  const tripMin = quote?.minutes ?? 15;

  const remaining =
    phase === 'arriving'
      ? Math.max(1, Math.ceil(pickupMin * (1 - progress)))
      : Math.max(1, Math.ceil(tripMin * (1 - progress)));

  const headline =
    phase === 'arriving'
      ? { big: `${remaining}`, unit: 'min away', sub: `${driver.name} is on the way to ${state.pickup.name}` }
      : phase === 'arrived'
        ? { big: 'Here', unit: '', sub: `${driver.name} has arrived — look for the ${driver.colour.toLowerCase()} ${driver.vehicle}` }
        : { big: `${remaining}`, unit: 'min to go', sub: `Heading to ${state.dropoff?.name}` };

  const eta = new Date(state.now.getTime() + remaining * 60000);
  const arriveAt = eta.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <div className="eta-hero">
          <span className="eta-num">{headline.big}</span>
          <span className="eta-unit">{headline.unit}</span>
          {phase === 'ontrip' && (
            <span className="eta-unit" style={{ marginLeft: 'auto' }}>arriving {arriveAt}</span>
          )}
        </div>
        <p className="sheet-sub">{headline.sub}</p>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
        </div>

        <div className="driver-card">
          <span className="avatar">{initials(driver.name)}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 16, letterSpacing: '-0.02em' }}>{driver.name}</strong>
              <span className="rating-inline">
                <IconStarFilled width={13} height={13} />
                {driver.rating.toFixed(2)}
              </span>
            </span>
            <div style={{ fontSize: 13, color: 'var(--muted)' }}>
              {driver.colour} {driver.vehicle} · {driver.language}
            </div>
            <div style={{ marginTop: 7 }}>
              <span className="plate">{driver.plate}</span>
            </div>
          </span>
        </div>

        <div className="action-grid">
          <button className="action-tile" onClick={() => dispatch({ type: 'sheet', sheet: 'contact' })}>
            <IconChat width={19} height={19} />
            Message
          </button>
          <button
            className="action-tile"
            onClick={() => dispatch({ type: 'toast', message: `Calling ${driver.name}…` })}
          >
            <IconPhone width={19} height={19} />
            Call
          </button>
          <button className="action-tile danger" onClick={() => dispatch({ type: 'sheet', sheet: 'safety' })}>
            <IconShield width={19} height={19} />
            Safety
          </button>
        </div>

        {phase === 'ontrip' ? (
          <button
            className="btn btn-dark"
            onClick={() => dispatch({ type: 'toast', message: 'Live trip link sent to Kojo and Mum' })}
          >
            <IconShare width={18} height={18} />
            Share live trip
          </button>
        ) : (
          <button className="btn btn-danger" onClick={() => dispatch({ type: 'cancel' })}>
            Cancel trip
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Trip complete                                                       */
/* ------------------------------------------------------------------ */

export function CompleteSheet() {
  const { state, dispatch, quote, total } = useRyde();
  const driver = state.driver;
  if (!driver || !quote) return null;

  const payment = PAYMENT_METHODS.find((p) => p.id === state.payment)!;
  const grandTotal = total + state.tip;

  /** Settle on the server first — the ledger is the source of truth. */
  const finish = async () => {
    if (api.isLive() && state.serverTripId) {
      try {
        const receipt = await api.completeTrip(state.serverTripId, state.tip);
        const wallet = await api.getWallet();
        dispatch({ type: 'syncWallet', balance: api.toCedis(wallet.balancePesewas) });
        dispatch({ type: 'closeTrip' });
        dispatch({
          type: 'toast',
          message:
            receipt.settlement === 'momo_pending'
              ? 'Approve the MoMo prompt on your phone'
              : `Paid ${receipt.totalFormatted}`,
        });
        return;
      } catch (err) {
        dispatch({ type: 'toast', message: (err as Error).message });
        return;
      }
    }
    dispatch({ type: 'closeTrip' });
  };

  return (
    <div className="sheet">
      <div className="sheet-grab" />
      <div className="sheet-body">
        <h2 className="sheet-title">You've arrived</h2>
        <p className="sheet-sub">
          {state.dropoff?.name} · {quote.distanceKm.toFixed(1)} km in {quote.minutes} min
        </p>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="kv">
            <span className="k">Trip fare</span>
            <span className="v">{formatGHS(quote.fare)}</span>
          </div>
          {state.promoDiscount > 0 && (
            <div className="kv">
              <span className="k">Promo {state.promo}</span>
              <span className="v" style={{ color: 'var(--brand-bright)' }}>−{formatGHS(state.promoDiscount)}</span>
            </div>
          )}
          {state.tip > 0 && (
            <div className="kv">
              <span className="k">Tip for {driver.name.split(' ')[0]}</span>
              <span className="v">{formatGHS(state.tip)}</span>
            </div>
          )}
          <div className="kv total">
            <span className="k">Paid with {payment.label}</span>
            <span className="v">{formatGHS(grandTotal)}</span>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <strong style={{ fontSize: 15 }}>How was your ride with {driver.name.split(' ')[0]}?</strong>
        </div>
        <div className="stars">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`star-btn ${state.rating && n <= state.rating ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'rate', rating: n })}
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
            >
              {state.rating && n <= state.rating
                ? <IconStarFilled width={32} height={32} />
                : <IconStar width={32} height={32} />}
            </button>
          ))}
        </div>

        <div className="tip-row">
          {[0, 5, 10, 20].map((amount) => (
            <button
              key={amount}
              className={`tip ${state.tip === amount ? 'on' : ''}`}
              onClick={() => dispatch({ type: 'tip', amount })}
            >
              {amount === 0 ? 'No tip' : `GH₵${amount}`}
            </button>
          ))}
        </div>

        <button className="btn btn-primary" onClick={finish}>
          {state.rating ? 'Submit and done' : 'Done'}
        </button>
      </div>
    </div>
  );
}
