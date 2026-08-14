import { useEffect, useMemo, useRef, useState } from 'react';
import { PLACES, SAVED, searchPlaces, type Place, type PlaceKind } from '../data/places';
import { useRyde } from '../store/RydeStore';
import {
  IconBack, IconBriefcase, IconClock, IconHome, IconPin, IconSearch, IconStar, IconX,
} from './Icons';

function kindIcon(kind: PlaceKind) {
  if (kind === 'home') return <IconHome />;
  if (kind === 'work') return <IconBriefcase />;
  if (kind === 'airport' || kind === 'landmark' || kind === 'beach') return <IconPin />;
  return <IconPin />;
}

const RECENTS = ['kia', 'accramall', 'makola', 'ug', 'oxford'];

export default function SearchPanel() {
  const { state, dispatch } = useRyde();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const field = state.editing;

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => window.clearTimeout(t);
  }, [field]);

  const results = useMemo(() => searchPlaces(query, 10), [query]);

  const suggestions = useMemo(
    () => RECENTS.map((id) => PLACES.find((p) => p.id === id)!).filter(Boolean),
    [],
  );

  const pick = (place: Place) => {
    setQuery('');
    dispatch({ type: 'setPlace', field, place });
  };

  const close = () => {
    dispatch({ type: 'phase', phase: state.dropoff ? 'choosing' : 'idle' });
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <button className="icon-btn" onClick={close} aria-label="Back">
          <IconBack />
        </button>
        <h1>{field === 'pickup' ? 'Set pickup' : 'Where to?'}</h1>
      </div>

      <div style={{ padding: '14px 18px 0' }}>
        <div className="field-stack">
          <button
            className="field"
            onClick={() => dispatch({ type: 'openSearch', field: 'pickup' })}
          >
            <span className="node node-a" />
            {field === 'pickup' ? (
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Pickup location"
                aria-label="Pickup location"
              />
            ) : (
              <span className="field-value">{state.pickup.name}</span>
            )}
          </button>

          <button
            className="field"
            onClick={() => dispatch({ type: 'openSearch', field: 'dropoff' })}
          >
            <span className="node node-b" />
            {field === 'dropoff' ? (
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Where are you going?"
                aria-label="Destination"
              />
            ) : (
              <span className={`field-value ${state.dropoff ? '' : 'dim'}`}>
                {state.dropoff?.name ?? 'Where are you going?'}
              </span>
            )}
            {query && field === 'dropoff' && (
              <span onClick={(e) => { e.stopPropagation(); setQuery(''); }}>
                <IconX width={17} height={17} />
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="panel-body">
        {query.length > 0 ? (
          results.length > 0 ? (
            results.map((p) => (
              <button key={p.id} className="list-row" onClick={() => pick(p)}>
                <span className="list-icon">{kindIcon(p.kind)}</span>
                <span className="list-main">
                  <span className="list-title">{p.name}</span>
                  <span className="list-sub">{p.area}, Accra</span>
                </span>
              </button>
            ))
          ) : (
            <div className="empty">
              <IconSearch width={44} height={44} />
              <div>No places match “{query}”</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Try Osu, Madina, Spintex or Tema
              </div>
            </div>
          )
        ) : (
          <>
            <div className="section-label">Saved places</div>
            {[SAVED.home, SAVED.work].map((p) => (
              <button key={p.id} className="list-row" onClick={() => pick(p)}>
                <span className="list-icon accent">{kindIcon(p.kind)}</span>
                <span className="list-main">
                  <span className="list-title">{p.name}</span>
                  <span className="list-sub">{p.area}</span>
                </span>
                <IconStar width={17} height={17} color="var(--muted)" />
              </button>
            ))}

            <div className="section-label">Recent</div>
            {suggestions.map((p) => (
              <button key={p.id} className="list-row" onClick={() => pick(p)}>
                <span className="list-icon"><IconClock /></span>
                <span className="list-main">
                  <span className="list-title">{p.name}</span>
                  <span className="list-sub">{p.area}, Accra</span>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
