import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const cookieStore = await cookies();
  const connectionCookie = cookieStore.get('qbo_connection')?.value;

  if (connectionCookie === undefined) {
    redirect('/setup');
  }

  try {
    JSON.parse(connectionCookie);
  } catch {
    redirect('/setup');
  }

  redirect('/settlements');
}
