import { ImageResponse } from 'next/og';

export const size = {
  width: 64,
  height: 64
};

export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '64px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B273F',
          color: '#00C2B9',
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: '-0.02em'
        }}
      >
        T
      </div>
    ),
    {
      ...size
    }
  );
}
