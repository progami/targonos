import { Container } from '@/components/Container';

export default function Loading() {
  return (
    <section className="pt-14 md:pt-20">
      <Container>
        {/* Title skeleton */}
        <div className="h-12 w-48 animate-pulse rounded-lg bg-border/50 md:h-16 md:w-64" />
        
        {/* Subtitle skeleton */}
        <div className="mt-4 h-6 w-80 animate-pulse rounded-lg bg-border/30" />
        
        {/* Content skeletons */}
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-card bg-border/30" />
          <div className="h-64 animate-pulse rounded-card bg-border/30" />
        </div>
      </Container>
    </section>
  );
}
