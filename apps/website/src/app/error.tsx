'use client';

import { useEffect } from 'react';
import { Container } from '@/components/Container';
import { Button } from '@/components/Button';
import { site } from '@/content/site';

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <section className="pt-16 md:pt-24">
      <Container>
        <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">
          Something went wrong
        </h1>
        <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
          We encountered an unexpected error. Please try again or contact support if the problem persists.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button asChild variant="outline">
            <a href={`mailto:${site.contactEmail}`}>Contact support</a>
          </Button>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-muted">
            Error ID: {error.digest}
          </p>
        )}
      </Container>
    </section>
  );
}
