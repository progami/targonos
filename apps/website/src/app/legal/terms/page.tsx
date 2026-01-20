import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { site } from '@/content/site';

export const metadata = {
  title: 'Terms'
};

export default function TermsPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">
            Terms of Service
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            Template only — have counsel review for your specific products, jurisdictions, and fulfillment.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <Card className="p-8">
            <div className="prose max-w-none">
              <p><strong>Last updated:</strong> January 2026</p>

              <h2>Overview</h2>
              <p>
                By accessing {site.domain} you agree to these Terms. If you do not agree, do not use the site.
              </p>

              <h2>Purchases</h2>
              <p>
                Purchases are typically completed through third-party retailers (for example, Amazon). Order processing, returns, and refunds are subject to that retailer’s policies.
              </p>

              <h2>Product information</h2>
              <p>
                We try to keep product descriptions and specifications accurate. However, packaging and product details may change over time. Always refer to the product packaging for the most current information.
              </p>

              <h2>Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, {site.name} will not be liable for indirect, incidental, special, or consequential damages arising from use of the site.
              </p>

              <h2>Contact</h2>
              <p>
                Questions? Email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
              </p>
            </div>
          </Card>
        </Container>
      </section>
    </div>
  );
}
