import { useEffect, useState } from 'react';
import { IconPlus, IconShare, IconX } from './Icons';

/** Chromium fires this so a site can offer installation at its own moment. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'ryde.install.dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS exposes it here rather than through display-mode.
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

function isIosSafari(): boolean {
  const ua = window.navigator.userAgent;

  // Every Chromium UA string contains "Safari", so testing for Safari alone
  // misidentifies Android Chrome as iOS and shows it the wrong instructions.
  // Rule out the other engines first.
  if (/Android|Chrome|Chromium|CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return false;
  if (!/Safari/.test(ua)) return false;

  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS reports as a Mac, so fall back to touch support to tell them apart.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  // Desktop Safari installs to the Dock, not a home screen — don't tell a
  // mouse user to tap anything.
  return ios && window.matchMedia('(pointer: coarse)').matches;
}

/**
 * Offer to install the app.
 *
 * Two paths, because the platforms differ: Chromium hands us a deferred prompt
 * we can trigger, while iOS has no such API and needs the user to be told where
 * the Share menu is. Dismissal sticks, so this never becomes a nag.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (event: Event) => {
      // Suppress the browser's own mini-infobar; we choose the moment.
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);

    // iOS never fires the event, so surface the manual route after a beat
    // rather than the instant the app loads.
    let timer: number | undefined;
    if (isIosSafari()) timer = window.setTimeout(() => setVisible(true), 4000);

    const onInstalled = () => setVisible(false);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') setVisible(false);
    else dismiss();
    setDeferred(null);
  };

  return (
    <div className="install-card">
      <span className="install-icon">
        <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width={40} height={40} />
      </span>

      <span className="install-copy">
        <strong>Install Ryde</strong>
        {deferred ? (
          <span>Full screen, and works offline.</span>
        ) : (
          <span>
            Tap <IconShare width={13} height={13} style={{ verticalAlign: -2 }} /> Share, then
            “Add to Home Screen”.
          </span>
        )}
      </span>

      {deferred && (
        <button className="btn btn-primary btn-sm" onClick={install}>
          <IconPlus width={16} height={16} />
          Install
        </button>
      )}

      <button className="icon-btn install-close" onClick={dismiss} aria-label="Dismiss">
        <IconX width={17} height={17} />
      </button>
    </div>
  );
}

/** Small pill shown while the device has no connection. */
export function OfflineChip() {
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="chip warn" title="Cached map and trips still work">
      <span className="dot" />
      Offline
    </div>
  );
}
