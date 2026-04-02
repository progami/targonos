import WprLayout from '@/components/wpr/wpr-layout';

export default function WprSectionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WprLayout>{children}</WprLayout>;
}
