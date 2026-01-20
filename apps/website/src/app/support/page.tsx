import Link from 'next/link';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';

export const metadata = {
  title: 'Support'
};

export default function SupportPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Support.</h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">Email us and we’ll help.</p>
          </Reveal>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-12">
            <div className="md:col-span-5">
              <Reveal variant="media">
                <Card className="p-6">
                <div className="text-sm font-semibold text-ink">Email support</div>
                <p className="mt-2 text-sm text-muted">Fastest help is email.</p>
                <div className="mt-4">
                  <Button asChild variant="primary">
                    <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
                  </Button>
                </div>
                <div className="mt-4 text-xs text-muted">
                  Orders, payments, shipping and returns are handled on Amazon.
                </div>
                </Card>
              </Reveal>

              <Reveal variant="media" delay={120}>
                <Card className="mt-6 p-6">
                <div className="text-sm font-semibold text-ink">Where to buy</div>
                <p className="mt-2 text-sm text-muted">
                  Compare packs here, then check out on Amazon.
                </p>
                <div className="mt-4">
                  <Button asChild variant="outline">
                    <Link href="/products">Compare packs</Link>
                  </Button>
                </div>
                </Card>
              </Reveal>
            </div>

            <div className="md:col-span-7">
              <Reveal variant="media" delay={120}>
                <Card className="p-8">
                <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Using dust sheets</h2>
                <div className="mt-6 space-y-4 text-sm text-muted md:text-base">
                  <p>
                    <strong className="text-ink">1) Cover first.</strong> Protect floors, furniture, and doorways before sanding or painting.
                  </p>
                  <p>
                    <strong className="text-ink">2) Tape edges.</strong> For best dust control, tape the perimeter and seams where sheets overlap.
                  </p>
                  <p>
                    <strong className="text-ink">3) Fold and store.</strong> After use, fold the sheet down and store it dry for the next job.
                  </p>
                  <p>
                    <strong className="text-ink">Safety note:</strong> Keep plastic sheeting away from babies and children.
                  </p>
                </div>
                </Card>
              </Reveal>
            </div>
          </div>
        </Container>
      </section>
    </div>
  );
}
