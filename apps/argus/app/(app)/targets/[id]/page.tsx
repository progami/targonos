import { redirect } from 'next/navigation';

export default async function TargetRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/monitoring/${id}`);
}

