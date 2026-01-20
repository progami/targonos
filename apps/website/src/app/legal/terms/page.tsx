import { Container } from '@/components/Container';
import { site } from '@/content/site';

export const metadata = {
  title: 'Terms'
};

export default function TermsPage() {
  return (
    <Container className="py-16">
      <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Terms</h1>

      <div className="mt-8 space-y-4 text-sm text-muted md:text-base">
        <p>
          This website is provided for product information and support. Purchases are completed on Amazon, and your
          order (including payment, shipping, and returns) is governed by Amazon’s terms.
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
    </Container>
  );
}
