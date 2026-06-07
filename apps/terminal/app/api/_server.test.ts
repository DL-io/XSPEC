import { describe, expect, it } from 'vitest';
import { requireApiAccess } from './_server';

describe('API access controls', () => {
  it('does not trust operator role headers unless explicitly enabled at process start', async () => {
    const request = new Request('https://terminal.example.test/api/orders?tenantId=tenant-1', {
      headers: { 'x-polyshore-role': 'owner' }
    });

    await expect(requireApiAccess(request, { tenantId: 'tenant-1', permission: 'killswitch:manage' })).rejects.toMatchObject({
      status: 401
    });
  });
});
