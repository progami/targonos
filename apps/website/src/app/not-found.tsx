import Link from 'next/link';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';

export default function NotFound() {
  return (
    <section className="pt-16 md:pt-24">
      <Container>
        <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Page not found</h1>
        <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
          The page you’re looking for doesn’t exist (or it was moved).
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/">Go home</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/products">View products</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
