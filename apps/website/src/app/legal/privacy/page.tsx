import { Container } from '@/components/Container';
import { Card } from '@/components/Card';
import { Reveal } from '@/components/Reveal';
import { site } from '@/content/site';

export const metadata = {
  title: 'Privacy'
};

export default function PrivacyPage() {
  return (
    <div>
      <section className="pt-14 md:pt-20">
        <Container>
          <Reveal>
            <h1 className="text-4xl font-semibold tracking-tightish md:text-6xl">Privacy.</h1>
          </Reveal>
          <Reveal delay={80}>
            <p className="mt-4 max-w-2xl text-base text-muted md:text-lg">
              How we handle your information.
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
              </Card>
            </Reveal>
          </div>
        </Container>
      </section>
    </div>
  );
}
