'use client';

import { useEffect } from 'react';

export function HomeRuntime() {
  useEffect(() => {
    document.documentElement.classList.add('tg-home');
    document.body.classList.add('tg-home');

    return () => {
      document.documentElement.classList.remove('tg-home');
      document.body.classList.remove('tg-home');
    };
  }, []);

  return null;
}
