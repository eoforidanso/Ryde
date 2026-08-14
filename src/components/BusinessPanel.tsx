import { useMemo, useState } from 'react';
import {
  BUSINESS_TRIPS, COMPANY, DEPARTMENTS, DEPARTMENT_BY_ID, EMPLOYEES, EMPLOYEE_BY_ID, ME, MONTHLY,
} from '../data/business';
import { PRODUCT_BY_ID } from '../data/products';
import { formatGHS } from '../lib/pricing';
import { useRyde } from '../store/RydeStore';
import { ProductIcon } from './productIcon';
import { IconAlert, IconBack, IconBuilding, IconChart, IconReceipt, IconUsers } from './Icons';

type Section = 'overview' | 'trips' | 'people' | 'billing';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'trips', label: 'Trips' },
  { id: 'people', label: 'People' },
  { id: 'billing', label: 'Billing' },
];

function short(amount: number): string {
  return amount >= 1000 ? `GH₵${(amount / 1000).toFixed(1)}k` : `GH₵${Math.round(amount)}`;
}

/**
 * Monthly spend as bars.
 *
 * Deliberately plain SVG rather than a chart library: six bars and a baseline
 * is not worth 40 kB, and this way the colours come from the same tokens as
 * the rest of the app.
 */
function SpendChart({ current }: { current: number }) {
  const months = useMemo(
    () => MONTHLY.map((m, i) => (i === MONTHLY.length - 1 ? { ...m, spend: current } : m)),
    [current],
  );
  const peak = Math.max(...months.map((m) => m.spend));

  return (
    <div className="chart">
      {months.map((m, i) => {
        const live = i === months.length - 1;
        return (
          <div key={m.month} className="chart-col">
            <span className="chart-value">{short(m.spend)}</span>
            {/* The track is what the bar is a percentage of — sizing the bar
                against the whole column would clip it behind the labels. */}
            <span className="chart-track">
              <span
                className={`chart-bar ${live ? 'live' : ''}`}
                style={{ height: `${Math.max(6, (m.spend / peak) * 100)}%` }}
              />
            </span>
            <span className="chart-label">{m.month}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function BusinessPanel() {
  const { state, dispatch } = useRyde();
  const [section, setSection] = useState<Section>('overview');

  const trips = state.businessTrips;

  /** Trips added by this session, on top of the seeded month. */
  const sessionTrips = trips.length - BUSINESS_TRIPS.length;

  /**
   * Everything on this screen is derived from the trip log rather than stored
   * alongside it — a dashboard that can disagree with its own trips is worse
   * than no dashboard.
   */
  const totals = useMemo(() => {
    const spend = trips.reduce((s, t) => s + t.fare, 0);
    const flagged = trips.filter((t) => t.flagged);
    const byDept = DEPARTMENTS.map((d) => {
      const rows = trips.filter((t) => EMPLOYEE_BY_ID[t.employeeId]?.departmentId === d.id);
      return {
        dept: d,
        trips: rows.length,
        spend: rows.reduce((s, t) => s + t.fare, 0),
      };
    }).sort((a, b) => b.spend - a.spend);

    // Each employee's month-to-date already covers the seeded log, so only
    // trips taken in this session are added on top of it.
    const byEmployee = EMPLOYEES.map((e) => {
      const sessionSpend = e.id === ME.id ? state.businessSessionSpend : 0;
      const spent = e.spent + sessionSpend;
      return {
        employee: e,
        trips: e.trips + (e.id === ME.id ? sessionTrips : 0),
        spent,
        over: spent > e.monthlyLimit,
      };
    }).sort((a, b) => b.spent - a.spent);

    return { spend, flagged, byDept, byEmployee };
  }, [trips, sessionTrips, state.businessSessionSpend]);

  const monthSpend = MONTHLY[MONTHLY.length - 1].spend + state.businessSessionSpend;
  const budget = DEPARTMENTS.reduce((s, d) => s + d.budget, 0);

  return (
    <div className="panel" style={{ animation: 'none' }}>
      <div className="panel-head">
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'panel', panel: null })}
          aria-label="Back to account"
        >
          <IconBack />
        </button>
        <h1>Business</h1>
      </div>

      <div className="panel-body">
        <div className="company-card">
          <span className="list-icon gold" style={{ width: 44, height: 44 }}>
            <IconBuilding width={22} height={22} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 750, letterSpacing: '-0.025em' }}>{COMPANY.name}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Account {COMPANY.account} · {COMPANY.billing}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Administered by {COMPANY.admin}
            </div>
          </span>
        </div>

        <div className="seg">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              className={`seg-btn ${section === s.id ? 'on' : ''}`}
              onClick={() => setSection(s.id)}
              aria-pressed={section === s.id}
            >
              {s.label}
            </button>
          ))}
        </div>

        {section === 'overview' && (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="n">{short(monthSpend)}</div>
                <div className="l">This month</div>
              </div>
              <div className="stat">
                <div className="n">{MONTHLY[MONTHLY.length - 1].trips + sessionTrips}</div>
                <div className="l">Trips</div>
              </div>
              <div className="stat">
                <div className="n">{Math.round((monthSpend / budget) * 100)}%</div>
                <div className="l">Of budget</div>
              </div>
            </div>

            <div className="section-label"><IconChart width={13} height={13} style={{ verticalAlign: -2, marginRight: 6 }} />Monthly spend</div>
            <SpendChart current={monthSpend} />

            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              August is tracking {monthSpend < MONTHLY[4].spend ? 'below' : 'above'} July —{' '}
              {short(Math.abs(monthSpend - MONTHLY[4].spend))} {monthSpend < MONTHLY[4].spend ? 'less' : 'more'} so far,
              against a {short(budget)} monthly budget.
            </p>

            {totals.flagged.length > 0 && (
              <>
                <div className="section-label">Needs approval</div>
                {totals.flagged.map((t) => (
                  <div key={t.id} className="list-row">
                    <span className="list-icon" style={{ background: 'var(--red-soft)', color: '#ff8a84' }}>
                      <IconAlert />
                    </span>
                    <span className="list-main">
                      <span className="list-title">{EMPLOYEE_BY_ID[t.employeeId]?.name ?? 'Unknown'}</span>
                      <span className="list-sub">{t.to} · over monthly limit</span>
                    </span>
                    <span className="list-meta">{formatGHS(t.fare)}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}

        {section === 'trips' && (
          <>
            <div className="section-label">Employee trip log</div>
            {trips.map((t) => {
              const who = EMPLOYEE_BY_ID[t.employeeId];
              return (
                <div key={t.id} className="list-row">
                  <span className={`list-icon ${t.flagged ? '' : 'accent'}`}
                        style={t.flagged ? { background: 'var(--red-soft)', color: '#ff8a84' } : undefined}>
                    <ProductIcon id={t.product} size={20} />
                  </span>
                  <span className="list-main">
                    <span className="list-title">{t.from} → {t.to}</span>
                    <span className="list-sub">
                      {who?.name ?? 'Unknown'} · {t.purpose} · {t.when}
                    </span>
                    <span className="list-sub" style={{ color: 'var(--muted)' }}>
                      {PRODUCT_BY_ID[t.product].name}
                      {t.flagged ? ' · flagged for approval' : ''}
                    </span>
                  </span>
                  <span className="list-meta">{formatGHS(t.fare)}</span>
                </div>
              );
            })}
          </>
        )}

        {section === 'people' && (
          <>
            <div className="section-label">Spending limits</div>
            {totals.byEmployee.map(({ employee, spent, over, trips: n }) => {
              const pct = Math.min(100, (spent / employee.monthlyLimit) * 100);
              return (
                <div key={employee.id} className="limit-row">
                  <div className="limit-head">
                    <span className="list-title">
                      {employee.name}
                      {employee.id === ME.id ? ' (you)' : ''}
                    </span>
                    <span className={`list-meta ${over ? 'over' : ''}`}>
                      {formatGHS(spent)} / {formatGHS(employee.monthlyLimit)}
                    </span>
                  </div>
                  <div className="list-sub">
                    {employee.role} · {DEPARTMENT_BY_ID[employee.departmentId].name} · {n} trips
                  </div>
                  <div className="limit-bar">
                    <span className={`limit-fill ${over ? 'over' : pct > 85 ? 'near' : ''}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              A trip over the limit is never blocked — it goes ahead and is flagged here for
              {' '}{COMPANY.admin.split(' · ')[0]} to approve.
            </p>
          </>
        )}

        {section === 'billing' && (
          <>
            <div className="section-label">Department billing</div>
            {totals.byDept.map(({ dept, spend, trips: n }) => (
              <div key={dept.id} className="limit-row">
                <div className="limit-head">
                  <span className="list-title">{dept.name}</span>
                  <span className="list-meta">{formatGHS(spend)}</span>
                </div>
                <div className="list-sub">
                  Cost centre {dept.code} · {n} {n === 1 ? 'trip' : 'trips'} · {short(dept.budget)} budget
                </div>
                <div className="limit-bar">
                  <span
                    className="limit-fill"
                    style={{ width: `${Math.min(100, (spend / dept.budget) * 100)}%` }}
                  />
                </div>
              </div>
            ))}

            <div className="section-label">Invoices</div>
            {MONTHLY.slice().reverse().slice(1, 4).map((m) => (
              <button
                key={m.month}
                className="list-row"
                onClick={() => dispatch({ type: 'toast', message: `${m.month} invoice sent to ${COMPANY.admin.split(' · ')[0]}` })}
              >
                <span className="list-icon accent"><IconReceipt /></span>
                <span className="list-main">
                  <span className="list-title">{m.month} statement</span>
                  <span className="list-sub">{m.trips} trips · paid</span>
                </span>
                <span className="list-meta">{formatGHS(m.spend)}</span>
              </button>
            ))}

            <div className="section-label">Admin</div>
            <button
              className="list-row"
              onClick={() => dispatch({ type: 'toast', message: 'Invite sent — new riders join on the company account' })}
            >
              <span className="list-icon accent"><IconUsers /></span>
              <span className="list-main">
                <span className="list-title">Invite an employee</span>
                <span className="list-sub">They ride on {COMPANY.account} from their first trip</span>
              </span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
