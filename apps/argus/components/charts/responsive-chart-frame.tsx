'use client';

import {
  cloneElement,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Box } from '@mui/material';

type ResponsiveChartFrameProps = {
  children: ReactElement<{ height?: number; width?: number }>;
  height: number | string;
};

export default function ResponsiveChartFrame({
  children,
  height,
}: ResponsiveChartFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (node === null) {
      return;
    }

    const measure = () => {
      setSize({
        width: node.clientWidth,
        height: node.clientHeight,
      });
    };

    measure();
    const frameId = window.requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, []);

  return (
    <Box ref={containerRef} sx={{ width: '100%', height, minWidth: 0 }}>
      {size.width > 0 && size.height > 0
        ? cloneElement(children, {
            width: size.width,
            height: size.height,
          })
        : null}
    </Box>
  );
}
