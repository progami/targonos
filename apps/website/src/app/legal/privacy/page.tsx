import { Container } from '@/components/Container';
import { site } from '@/content/site';

export const metadata = {
  title: 'Privacy'
};

export default function PrivacyPage() {
  return (
    <Container className="py-16">
      <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Privacy</h1>
      <div className="mt-8 space-y-4 text-sm text-muted md:text-base">
        <p>
          We keep this site intentionally simple. We do not run a checkout on targonglobal.com — purchases happen on
          Amazon.
        </p>
        <p>
          We may collect basic analytics (page views, device type) to improve the site and troubleshoot issues.
        </p>
        <p>
          If you email us, we will use your message to respond and provide support. We do not sell personal data.
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
