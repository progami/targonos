import Link from 'next/link';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';

export const metadata = {
  title: 'About'
};

export default function AboutPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">
            Make the simplest choice the best one.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            Targon Global builds sustainable protection products that feel premium, perform in real-world use, and stay out of the landfill longer.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Design</div>
              <p className="mt-2 text-sm text-muted">
                A clean lineup, clear differences, and product pages that answer questions fast.
              </p>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Materials</div>
              <p className="mt-2 text-sm text-muted">
                Recycled cotton blends reinforced with recycled plastic fibers — tuned for durability and repeat use.
              </p>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Execution</div>
              <p className="mt-2 text-sm text-muted">
                We obsess over the small things: grip, edge control, foldability, and consistency.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      <section className="mt-20">
        <Container>
          <div className="rounded-card border border-border bg-surface p-8 shadow-softer md:p-12">
            <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">What we believe</h2>
            <div className="mt-5 space-y-4 text-sm text-muted md:text-base">
              <p>
                Sustainability should not feel like a compromise. Our goal is to build products that people choose because they’re simply better — and happen to be made with recycled materials.
              </p>
              <p>
                If you want to adjust this story (certifications, supply chain specifics, testing standards), update this page’s copy and the product specs.
              </p>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/products">Explore products</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/support">Support</Link>
              </Button>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
