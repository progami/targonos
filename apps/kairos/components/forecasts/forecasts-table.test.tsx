import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ForecastsTable } from './forecasts-table';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual<typeof import('@tanstack/react-query')>('@tanstack/react-query');

  return {
    ...actual,
    useQuery: vi.fn(({ queryKey }: { queryKey: readonly string[] }) => {
      if (queryKey[1] === 'time-series') {
        return {
          data: { series: [] },
          isLoading: false,
          isError: false,
          isFetching: false,
        };
      }

      return {
        data: undefined,
        isLoading: false,
        isError: true,
        isFetching: false,
        error: new Error('Request timed out.'),
        refetch: vi.fn(),
      };
    }),
    useMutation: vi.fn(() => ({
      mutateAsync: vi.fn(),
      isPending: false,
    })),
    useQueryClient: vi.fn(() => ({
      invalidateQueries: vi.fn(),
    })),
  };
});

describe('ForecastsTable', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the timed-out forecasts error state', () => {
    render(<ForecastsTable />);

    expect(screen.getByText('Failed to load forecasts: Request timed out.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('0 forecast(s)')).toBeTruthy();
  });
});
