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
          justifyContent: 'center',
          flexDirection: 'column',
          background: '#000000',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(120deg, rgba(0,194,185,0.18) 0%, rgba(0,0,0,0) 48%), linear-gradient(0deg, rgba(11,39,63,0.65) 0%, rgba(0,0,0,0.85) 60%)'
          }}
        />

        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 26, padding: '64px' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div
                style={{
                  fontSize: 120,
                  fontWeight: 900,
                  letterSpacing: '-0.06em',
                  color: '#FFFFFF',
                  lineHeight: 1
                }}
              >
                TARGON
              </div>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#00C2B9'
                }}
              />
            </div>
          </div>

          <div
            style={{
              fontSize: 34,
              fontWeight: 500,
              color: '#FFFFFF',
              opacity: 0.78,
              maxWidth: 920,
              textAlign: 'center',
              lineHeight: 1.25
            }}
          >
            {site.description}
          </div>
        </div>
      </div>
    ),
    {
      ...size
    }
  );
}
