import Link from 'next/link';
import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FAQ } from '@/components/FAQ';
import { faqs } from '@/content/faqs';
import { site } from '@/content/site';

export const metadata = {
  title: 'Support'
};

export default function SupportPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Support</h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            Care tips, common questions, and help if something isn’t right.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <div className="grid gap-6 md:grid-cols-3">
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Care</div>
              <p className="mt-2 text-sm text-muted">
                Shake off debris, store dry, and avoid long exposure to wet paint. Follow packaging instructions for best results.
              </p>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Orders (Amazon)</div>
              <p className="mt-2 text-sm text-muted">
                If you ordered on Amazon, returns and tracking are handled there. If something arrived damaged, email us and include your order details.
              </p>
            </Card>
            <Card className="p-6">
              <div className="text-sm font-semibold text-ink">Bulk / wholesale</div>
              <p className="mt-2 text-sm text-muted">
                Need bulk purchasing or private label? Contact us and we’ll route you to the right option.
              </p>
            </Card>
          </div>
        </Container>
      </section>

      <section className="mt-20">
        <Container>
          <div className="grid gap-10 md:grid-cols-12">
            <div className="md:col-span-4">
              <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">FAQ</h2>
              <p className="mt-3 text-sm text-muted">
                Still stuck? Email{' '}
                <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>
                  {site.contactEmail}
                </a>
                .
              </p>
            </div>
            <div className="md:col-span-8">
              <div className="grid gap-3">
                <FAQ items={faqs} />
              </div>
            </div>
          </div>
        </Container>
      </section>

      <section className="mt-20">
        <Container>
          <div className="rounded-card bg-ink p-8 text-white shadow-soft md:p-12">
            <div className="grid gap-8 md:grid-cols-12 md:items-center">
              <div className="md:col-span-8">
                <h2 className="text-2xl font-semibold tracking-tightish md:text-4xl">Need help fast?</h2>
                <p className="mt-3 max-w-2xl text-sm text-white/75 md:text-base">
                  Send a short note, include your product and where you purchased, and we’ll respond.
                </p>
              </div>
              <div className="md:col-span-4 md:flex md:justify-end">
                <Button asChild variant="accent" size="lg" className="bg-accent text-ink">
                  <a href={`mailto:${site.contactEmail}`}>Email support</a>
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 text-xs text-muted">
            Prefer self-serve? Browse <Link className="font-semibold text-ink hover:underline" href="/products">product pages</Link> for specs and care.
          </div>
        </Container>
      </section>
    </div>
  );
}
