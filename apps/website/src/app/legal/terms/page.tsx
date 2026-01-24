import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';

export const metadata = {
  title: 'Terms'
};

export default function TermsPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Terms.</h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
              Terms of use for this website.
            </p>
          </Reveal>
        </Container>
      </section>

      <section className="mt-12 pb-16">
        <Container>
          <div className="max-w-3xl">
            <Reveal variant="media">
              <Card className="p-8">
                <div className="space-y-4 text-sm text-muted md:text-base">
                  <p>
                    This website is provided for product information and support. Purchases are completed on Amazon, and your
                    order (including payment, shipping, and returns) is governed by Amazon&apos;s terms.
                  </p>
                  <p>
                    Product information on this site is provided &ldquo;as is&rdquo; and may change over time. For the most up-to-date
                    pricing and availability, refer to the Amazon listing.
                  </p>
                  <p>
                    Questions? Email{' '}
                    <a className="font-semibold text-ink hover:underline" href={`mailto:${site.contactEmail}`}>
                      {site.contactEmail}
                    </a>
                    .
                  </p>
                </div>
              </Card>
            </Reveal>
          </div>
        </Container>
      </section>
    </div>
  );
}
