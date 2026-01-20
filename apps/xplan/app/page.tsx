import SheetPage from './[sheet]/page';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return SheetPage({
    params: Promise.resolve({ sheet: '1-strategies' }),
    searchParams,
  });
}
