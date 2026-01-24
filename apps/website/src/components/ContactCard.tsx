import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { site } from '@/content/site';

export function ContactCard({
  title = 'Need help?',
  description = 'Email us anytime.',
  variant = 'default'
}: {
  title?: string;
  description?: string;
  variant?: 'default' | 'compact';
}) {
  if (variant === 'compact') {
    return (
      <Card className="p-6">
        <div className="text-sm font-semibold text-ink">{title}</div>
        <p className="mt-2 text-sm text-muted">{description}</p>
        <p className="mt-4 text-sm">
          <a
            className="font-semibold text-ink hover:underline"
            href={`mailto:${site.contactEmail}`}
          >
            {site.contactEmail}
          </a>
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="text-sm font-semibold text-ink">{title}</div>
      <p className="mt-2 text-sm text-muted">{description}</p>
      <div className="mt-4">
        <Button asChild>
          <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
        </Button>
      </div>
    </Card>
  );
}
