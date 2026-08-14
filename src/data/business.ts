/**
 * Ryde for Business — the company account behind a rider's work profile.
 *
 * Modelled the way a Ghanaian company actually buys rides: one account, a
 * handful of departments that each carry their own cost centre for the finance
 * team, and per-employee monthly limits that the app checks *before* the trip
 * rather than surprising anyone at month end.
 */

import type { ProductId } from './products';

export interface Department {
  id: string;
  name: string;
  /** Cost centre the invoice line is billed against. */
  code: string;
  /** Monthly budget in cedis. */
  budget: number;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  departmentId: string;
  msisdn: string;
  /** Cedis this employee may spend per month. */
  monthlyLimit: number;
  /** Spent so far this month, before any trip taken in this session. */
  spent: number;
  trips: number;
}

export interface BusinessTrip {
  id: string;
  employeeId: string;
  when: string;
  from: string;
  to: string;
  product: ProductId;
  fare: number;
  purpose: string;
  /** Trips over policy are still taken — they are flagged for approval, not blocked. */
  flagged: boolean;
}

export interface MonthTotals {
  month: string;
  trips: number;
  spend: number;
}

export const COMPANY = {
  name: 'Ashanti Digital Ltd',
  account: 'RB-004182',
  admin: 'Yaw Osei · Finance',
  billing: 'Invoiced monthly, net 30',
  location: 'Airport City, Accra',
};

export const DEPARTMENTS: Department[] = [
  { id: 'sales', name: 'Sales', code: 'CC-1100', budget: 4200 },
  { id: 'eng', name: 'Engineering', code: 'CC-2200', budget: 2600 },
  { id: 'ops', name: 'Operations', code: 'CC-3300', budget: 3400 },
  { id: 'exec', name: 'Executive', code: 'CC-1000', budget: 1800 },
];

export const DEPARTMENT_BY_ID: Record<string, Department> = Object.fromEntries(
  DEPARTMENTS.map((d) => [d.id, d]),
);

/** The signed-in rider is `emp-1` — her own limit is the one the app enforces. */
export const EMPLOYEES: Employee[] = [
  { id: 'emp-1', name: 'Ama Boakye', role: 'Account Director', departmentId: 'sales', msisdn: '024 ••• 4418', monthlyLimit: 900, spent: 612.5, trips: 19 },
  { id: 'emp-2', name: 'Kwesi Appiah', role: 'Field Engineer', departmentId: 'eng', msisdn: '055 ••• 3321', monthlyLimit: 700, spent: 428, trips: 14 },
  { id: 'emp-3', name: 'Naa Lartey', role: 'Operations Lead', departmentId: 'ops', msisdn: '020 ••• 8890', monthlyLimit: 1100, spent: 1043.5, trips: 31 },
  { id: 'emp-4', name: 'Selorm Agbo', role: 'Sales Executive', departmentId: 'sales', msisdn: '027 ••• 1174', monthlyLimit: 600, spent: 214, trips: 9 },
  { id: 'emp-5', name: 'Yaw Osei', role: 'Finance Manager', departmentId: 'exec', msisdn: '024 ••• 2205', monthlyLimit: 800, spent: 187.5, trips: 6 },
  { id: 'emp-6', name: 'Efua Mensimah', role: 'Support Analyst', departmentId: 'ops', msisdn: '050 ••• 6642', monthlyLimit: 500, spent: 471, trips: 22 },
];

export const EMPLOYEE_BY_ID: Record<string, Employee> = Object.fromEntries(
  EMPLOYEES.map((e) => [e.id, e]),
);

export const ME = EMPLOYEES[0];

export const BUSINESS_TRIPS: BusinessTrip[] = [
  { id: 'bt-1', employeeId: 'emp-3', when: 'Today, 08:14', from: 'Tema Community 1', to: 'Airport City', product: 'comfort', fare: 96, purpose: 'Client meeting — Vodafone', flagged: true },
  { id: 'bt-2', employeeId: 'emp-1', when: 'Today, 07:40', from: 'East Legon Hills', to: 'Airport City', product: 'go', fare: 38.5, purpose: 'Commute — office', flagged: false },
  { id: 'bt-3', employeeId: 'emp-2', when: 'Yesterday, 16:52', from: 'Airport City', to: 'Spintex Road', product: 'go', fare: 27, purpose: 'Site visit — Palace Mall', flagged: false },
  { id: 'bt-4', employeeId: 'emp-6', when: 'Yesterday, 14:05', from: 'Osu, Oxford Street', to: 'Accra Central (Makola)', product: 'okada', fare: 14.5, purpose: 'Document pickup', flagged: false },
  { id: 'bt-5', employeeId: 'emp-4', when: 'Yesterday, 11:20', from: 'Airport City', to: 'A&C Square', product: 'go', fare: 31, purpose: 'Client meeting — MTN', flagged: false },
  { id: 'bt-6', employeeId: 'emp-3', when: 'Yesterday, 09:02', from: 'Sakumono', to: 'Airport City', product: 'comfort', fare: 74, purpose: 'Commute — office', flagged: true },
  { id: 'bt-7', employeeId: 'emp-5', when: 'Mon, 17:30', from: 'Airport City', to: 'Cantonments City', product: 'comfort', fare: 42.5, purpose: 'Board dinner', flagged: false },
  { id: 'bt-8', employeeId: 'emp-1', when: 'Mon, 13:15', from: 'Airport City', to: 'Marina Mall', product: 'go', fare: 18, purpose: 'Client lunch', flagged: false },
  { id: 'bt-9', employeeId: 'emp-2', when: 'Mon, 08:48', from: 'Dome', to: 'Airport City', product: 'go', fare: 52, purpose: 'Commute — office', flagged: false },
  { id: 'bt-10', employeeId: 'emp-6', when: 'Sun, 19:22', from: 'Kaneshie Market', to: 'Dansoman Estates', product: 'aboboya', fare: 32, purpose: 'Equipment transfer', flagged: false },
];

/** Six months of closed invoices, most recent last — the shape a chart wants. */
export const MONTHLY: MonthTotals[] = [
  { month: 'Mar', trips: 118, spend: 4180 },
  { month: 'Apr', trips: 131, spend: 4620 },
  { month: 'May', trips: 104, spend: 3910 },
  { month: 'Jun', trips: 152, spend: 5480 },
  { month: 'Jul', trips: 147, spend: 5240 },
  { month: 'Aug', trips: 101, spend: 2956 },
];

export interface PolicyCheck {
  /** Whether the trip sits inside the employee's remaining monthly allowance. */
  withinPolicy: boolean;
  remaining: number;
  limit: number;
  spent: number;
  message: string;
}

/**
 * Check a fare against an employee's monthly allowance.
 *
 * Deliberately advisory: a trip over the limit still goes ahead and is flagged
 * for the finance team. Stranding someone in Ashaiman at 21:00 over a GH₵40
 * overage is not a policy, it is a safety incident.
 */
export function checkPolicy(employee: Employee, extraSpend: number, sessionSpend = 0): PolicyCheck {
  const spent = employee.spent + sessionSpend;
  const remaining = employee.monthlyLimit - spent;
  const withinPolicy = extraSpend <= remaining;

  return {
    withinPolicy,
    remaining: Math.max(0, remaining),
    limit: employee.monthlyLimit,
    spent,
    message: withinPolicy
      ? `GH₵${Math.max(0, remaining - extraSpend).toFixed(2)} left of your GH₵${employee.monthlyLimit} monthly limit`
      : `This trip puts you GH₵${(extraSpend - remaining).toFixed(2)} over your monthly limit — it will be flagged for ${COMPANY.admin.split(' · ')[0]}`,
  };
}

export const TRIP_PURPOSES = [
  'Client meeting',
  'Commute — office',
  'Site visit',
  'Airport transfer',
  'Document pickup',
];
