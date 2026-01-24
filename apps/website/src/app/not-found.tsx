import Link from 'next/link';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';

export default function NotFound() {
  return (
    <section className="pt-16 md:pt-24 pb-16">
      <Container>
        <Reveal>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Page not found.</h1>
        </Reveal>
        <Reveal delay={80}>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            The page you&apos;re looking for doesn&apos;t exist (or it was moved).
          </p>
        </Reveal>
        <Reveal delay={160}>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/">Go home</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/products">View packs</Link>
            </Button>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}
