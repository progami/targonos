import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function TargetDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = await prisma.watchTarget.findUnique({
    where: { id },
    select: { type: true },
  });

  if (!target) {
    redirect('/products');
  }

  const route =
    target.type === 'ASIN'
      ? `/products/${id}`
      : target.type === 'SEARCH'
        ? `/rankings/${id}`
        : `/bestsellers/${id}`;

  redirect(route);
}
