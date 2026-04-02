import { redirect } from 'next/navigation';

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrackingDetailRedirectPage({ params }: PageProps) {
  const { id } = await params;
  redirect(`/monitoring/${id}`);
}
