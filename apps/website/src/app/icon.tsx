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
          position: 'relative',
          background: '#002C51',
          color: '#FFFFFF',
          fontSize: 44,
          fontWeight: 900,
          letterSpacing: '-0.02em'
        }}
      >
        <div
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            width: 12,
            height: 12,
            borderRadius: 3,
            background: '#00C2B9'
          }}
        />
        T
      </div>
    ),
    {
      ...size
    }
  );
}
