import { NextResponse } from 'next/server';
import { fetchVendors, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';

const logger = createLogger({ name: 'plutus-bills-vendors' });

export async function GET() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const result = await fetchVendors(connection);
    if (result.updatedConnection) {
      await saveServerQboConnection(result.updatedConnection);
    }

    const vendors = result.vendors.map((v) => ({
      id: v.Id,
      name: v.DisplayName,
    }));

    vendors.sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ vendors });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to fetch vendors', error);
    return NextResponse.json(
      { error: 'Failed to fetch vendors', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
