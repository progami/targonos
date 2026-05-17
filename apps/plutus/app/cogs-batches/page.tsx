import { redirect } from 'next/navigation';

export default function CogsBatchesRedirectPage() {
  redirect('/purchase-orders?tab=cogs');
}
