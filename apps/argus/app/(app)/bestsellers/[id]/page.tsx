import { redirect } from 'next/navigation';

export default async function BestsellersDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/monitoring/${id}`);
}

