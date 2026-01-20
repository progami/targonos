import { ImageResponse } from 'next/og';
import { site } from '@/content/site';

export const size = {
  width: 1200,
  height: 630
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#F5F5F5',
          padding: '72px'
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{
            fontSize: 60,
            fontWeight: 800,
            letterSpacing: '-0.02em',
            color: '#0B273F'
          }}>{site.name}</div>
          <div style={{
            fontSize: 30,
            fontWeight: 500,
            color: '#0B273F',
            opacity: 0.78,
            maxWidth: 820
          }}>{site.description}</div>
        </div>
        <div style={{
          width: 220,
          height: 220,
          borderRadius: 999,
          background: '#0B273F',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#00C2B9',
          fontSize: 96,
          fontWeight: 900,
          letterSpacing: '-0.02em'
        }}>T</div>
      </div>
    ),
    {
      ...size
    }
  );
}
