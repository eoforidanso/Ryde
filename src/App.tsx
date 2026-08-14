import { useEffect, useState } from 'react';
import MapCanvas from './components/MapCanvas';
import Modals from './components/Modals';
import SearchPanel from './components/SearchPanel';
import SignIn from './components/SignIn';
import InstallPrompt, { OfflineChip } from './components/InstallPrompt';
import * as api from './lib/api';
import { ChoosingSheet, CompleteSheet, IdleSheet, MatchingSheet, TripSheet } from './components/RideSheets';
import { AccountTab, ActivityTab, WalletTab } from './components/Tabs';
import DriverSheet, { DriverTopBar } from './components/DriverMode';
import { IconCar, IconClock, IconShield, IconUser, IconWallet } from './components/Icons';
import { useRyde, type Tab } from './store/RydeStore';

function BrandMark() {
  return (
    <div className="brandmark">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect width="100" height="100" rx="26" fill="var(--brand)" />
        <path
          d="M50 20l7.2 22.1h23.2l-18.8 13.7 7.2 22.1L50 64.2 31.2 77.9l7.2-22.1-18.8-13.7h23.2z"
          fill="var(--gold)"
        />
      </svg>
      Ryde
    </div>
  );
}

function TrafficChip() {
  const { traffic } = useRyde();
  const tone = traffic.factor >= 2 ? 'hot' : traffic.factor >= 1.4 ? 'warn' : 'ok';
  return (
    <div className={`chip ${tone}`} title={traffic.reason}>
      <span className="dot" />
      {traffic.label}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: JSX.Element }[] = [
  { id: 'ride', label: 'Ride', icon: <IconCar /> },
  { id: 'activity', label: 'Activity', icon: <IconClock /> },
  { id: 'wallet', label: 'Wallet', icon: <IconWallet /> },
  { id: 'account', label: 'Account', icon: <IconUser /> },
];

function RideSheet() {
  const { state } = useRyde();
  switch (state.phase) {
    case 'idle':
      return <IdleSheet />;
    case 'choosing':
      return <ChoosingSheet />;
    case 'matching':
      return <MatchingSheet />;
    case 'arriving':
    case 'arrived':
    case 'ontrip':
      return <TripSheet />;
    case 'complete':
      return <CompleteSheet />;
    default:
      return null;
  }
}

/**
 * Session gate.
 *
 * Only applies when the payments service is configured — with no backend there
 * is nothing to authenticate against and the app runs on simulated state.
 */
function useSession() {
  const [status, setStatus] = useState<'checking' | 'in' | 'out'>(
    api.isLive() ? 'checking' : 'in',
  );

  useEffect(() => {
    if (!api.isLive()) return;
    // Unsubscribe on unmount so a rejected token can't set state after teardown.
    const unsubscribe = api.subscribeSignedOut(() => setStatus('out'));

    if (!api.getToken()) {
      setStatus('out');
      return unsubscribe;
    }
    // A stored token may have been revoked or expired server-side.
    api.me().then(() => setStatus('in')).catch(() => setStatus('out'));
    return unsubscribe;
  }, []);

  return { status, signIn: () => setStatus('in') };
}

export default function App() {
  const { state, dispatch } = useRyde();
  const { status, signIn } = useSession();
  const onTrip = ['matching', 'arriving', 'arrived', 'ontrip', 'complete'].includes(state.phase);
  const showTabs = !state.driverMode && state.phase !== 'search' && !onTrip;

  if (status === 'checking') {
    return (
      <div className="shell">
        <div className="device" style={{ display: 'grid', placeItems: 'center' }}>
          <BrandMark />
        </div>
      </div>
    );
  }

  if (status === 'out') {
    return (
      <div className="shell">
        <div className="device">
          <div className="stage">
            <MapCanvas />
            <div className="map-scrim" />
            <SignIn onSignedIn={signIn} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
      <div className="device">
        <div className="stage">
          <MapCanvas />
          <div className="map-scrim" />

          {state.tab === 'ride' && !state.driverMode && (
            <>
              <div className="topbar">
                <BrandMark />
                <OfflineChip />
                <TrafficChip />
                <button
                  className="icon-btn"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => dispatch({ type: 'sheet', sheet: 'safety' })}
                  aria-label="Safety toolkit"
                >
                  <IconShield />
                </button>
              </div>
              <RideSheet />
            </>
          )}

          {state.phase === 'search' && !state.driverMode && <SearchPanel />}

          {state.driverMode ? (
            <>
              <DriverTopBar />
              <DriverSheet />
            </>
          ) : (
            <>
              {state.tab === 'activity' && <ActivityTab />}
              {state.tab === 'wallet' && <WalletTab />}
              {state.tab === 'account' && <AccountTab />}
            </>
          )}

          <Modals />

          {/* Offered only when the map is idle — never over a live trip. */}
          {state.tab === 'ride' && state.phase === 'idle' && !state.driverMode && <InstallPrompt />}

          {state.toast && <div className="toast">{state.toast}</div>}
        </div>

        {showTabs && (
          <nav className="tabbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`tab ${state.tab === t.id ? 'on' : ''}`}
                onClick={() => dispatch({ type: 'tab', tab: t.id })}
                aria-current={state.tab === t.id}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
