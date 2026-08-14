/**
 * All money in this service is an integer number of pesewas (GH₵1 = 100p).
 * Floats never touch a balance. Cedis exist only at the edges: the Hubtel
 * request body and anything rendered to a human.
 */

export type Pesewas = number;

export function cedisToPesewas(cedis: number): Pesewas {
  return Math.round(cedis * 100);
}

/** Hubtel takes a decimal cedi amount, so convert only at the boundary. */
export function pesewasToCedis(p: Pesewas): number {
  return Math.round(p) / 100;
}

export function formatGHS(p: Pesewas): string {
  return `GH₵${(p / 100).toFixed(2)}`;
}

export function assertPositiveInt(value: unknown, field: string): Pesewas {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new HttpError(400, `${field} must be a positive integer number of pesewas`);
  }
  return value;
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

/** Split a fare into the driver's share and Ryde's commission. */
export function splitFare(farePesewas: Pesewas, commissionBp: number) {
  const commission = Math.round((farePesewas * commissionBp) / 10000);
  return { commission, driverShare: farePesewas - commission };
}
