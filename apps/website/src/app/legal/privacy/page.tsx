import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { site } from '@/content/site';

export const metadata = {
  title: 'Privacy'
};

export default function PrivacyPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">
            Privacy Policy
          </h1>
          <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
            This is a practical starting template. For legal accuracy, have counsel review it for your business.
          </p>
        </Container>
      </section>

      <section className="mt-12">
        <Container>
          <Card className="p-8">
            <div className="prose prose-slate max-w-none">
              <p><strong>Last updated:</strong> January 2026</p>
              <h2>Overview</h2>
              <p>
                {site.name} (“we”, “us”) respects your privacy. This policy explains what information we collect on {site.domain}, how we use it, and the choices you have.
              </p>

              <h2>Information we collect</h2>
              <ul>
                <li><strong>Contact info</strong> you send us (for example, via email).</li>
                <li><strong>Basic technical data</strong> (IP address, browser type) that servers log for security and performance.</li>
                <li><strong>Analytics</strong> (if enabled) to understand how pages are used. If you do not run analytics, remove this section.</li>
              </ul>

              <h2>How we use information</h2>
              <ul>
                <li>To respond to inquiries and support requests.</li>
                <li>To improve site performance and content.</li>
                <li>To protect the site against abuse and fraud.</li>
              </ul>

              <h2>Cookies</h2>
              <p>
                We may use cookies to keep the site working and (optionally) to measure usage. You can control cookies in your browser settings.
              </p>

              <h2>Third-party links</h2>
              <p>
                Our site links to third-party services (for example, Amazon) where purchases are completed. Their privacy practices are governed by their own policies.
              </p>

              <h2>Contact</h2>
              <p>
                For privacy questions, email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.
              </p>
            </div>
          </Card>
        </Container>
      </section>
    </div>
  );
}
