// Payment helpers for formation enrolments.
//
// A formation fee may be paid in several instalments with DIFFERENT methods
// (e.g. 40 cash now + 30 by cheque later). These helpers make the split
// explicit so an uncashed cheque never swallows the cash already collected.
import type { FormationPayment, FormationStudent } from '../types';

/** Every versement of an enrolment. Legacy rows (no `payments[]`) yield a single synthetic entry. */
export function instalmentsOf(s: FormationStudent): FormationPayment[] {
  if (s.payments && s.payments.length) return s.payments;
  if ((s.amountPaid || 0) <= 0) return [];
  return [{
    id: s.id,
    date: s.paidAt || '',
    amount: s.amountPaid,
    method: s.paymentMethod,
    chequeNumber: s.chequeNumber,
    chequeDate: s.chequeDate,
    chequePaid: s.chequePaid
  }];
}

/** Amount still held in a cheque that has not been cashed yet (0 if all are cashed). */
export function uncashedChequeAmount(s: FormationStudent): number {
  return instalmentsOf(s).reduce((sum, p) =>
    sum + (p.method === 'cheque' && p.chequePaid !== true ? (p.amount || 0) : 0), 0);
}

export function hasUncashedCheque(s: FormationStudent): boolean {
  return uncashedChequeAmount(s) > 0;
}

/** Money actually collected: cash versements + cashed cheques, minus refunds (floored at 0). */
export function collectedAmount(s: FormationStudent): number {
  const collected = instalmentsOf(s).reduce((sum, p) =>
    sum + (p.method === 'cheque' && p.chequePaid !== true ? 0 : (p.amount || 0)), 0);
  return Math.max(0, collected - (s.refundAmount || 0));
}
