import { usePendingPaymentRecovery } from '../../hooks/usePendingPaymentRecovery';

/** Renders nothing: mounts `usePendingPaymentRecovery` once, under the router and the query client. */
export function PendingPaymentRecovery() {
  usePendingPaymentRecovery();
  return null;
}
