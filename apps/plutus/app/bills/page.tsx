import { redirect } from 'next/navigation';

export default function BillsPage() {
  redirect('/transactions?tab=bill');
}
