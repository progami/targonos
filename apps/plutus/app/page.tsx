import { redirect } from 'next/navigation';
import { buildPlutusHomeRedirectPath } from '@/lib/qbo/connection-feedback';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function HomePage({ searchParams }: { searchParams?: SearchParams } = {}) {
  const resolvedSearchParams = searchParams === undefined ? {} : await searchParams;
  redirect(buildPlutusHomeRedirectPath(resolvedSearchParams));
}
