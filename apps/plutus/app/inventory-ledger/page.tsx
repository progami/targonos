import { redirect } from 'next/navigation';

export default function InventoryLedgerRedirectPage() {
  redirect('/purchase-orders?tab=ledger');
}
