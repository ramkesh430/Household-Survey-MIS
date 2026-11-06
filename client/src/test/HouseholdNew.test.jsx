import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setLanguage } from '@shared/i18n/index.js';
import HouseholdNew from '../pages/HouseholdNew.jsx';

const { storeMocks, apiMock, userMock } = vi.hoisted(() => ({
  storeMocks: {
    listWards: vi.fn(),
    listSettlements: vi.fn(),
    cacheWards: vi.fn(),
    cacheSettlements: vi.fn(),
    cacheSettlement: vi.fn(),
  },
  apiMock: vi.fn(),
  userMock: { id: 7, role: 'enumerator', ward_id: 1 },
}));

vi.mock('../lib/auth.jsx', () => ({ useAuth: () => ({ user: userMock }) }));
vi.mock('../lib/offline.jsx', () => ({ useOffline: () => ({ kick: vi.fn() }) }));
vi.mock('../lib/api.js', () => ({ api: apiMock }));
vi.mock('../offline/store.js', () => storeMocks);

describe('household settlement creation', () => {
  const cachedSettlements = [{ id: 1, ward_id: 1, code: 'S01', name: 'पुरानो टोल', is_active: true }];

  beforeEach(() => {
    setLanguage('ne');
    cachedSettlements.splice(1);
    storeMocks.listWards.mockReset().mockResolvedValue([{ id: 1, ward_no: 1, name: 'वडा नं. १' }]);
    storeMocks.listSettlements.mockReset().mockImplementation(async () => cachedSettlements);
    storeMocks.cacheWards.mockReset().mockResolvedValue(undefined);
    storeMocks.cacheSettlements.mockReset().mockResolvedValue(undefined);
    storeMocks.cacheSettlement.mockReset().mockImplementation(async (_userId, settlement) => cachedSettlements.push(settlement));
    apiMock.mockReset().mockImplementation(async (path) => {
      if (path === '/settlements') return { data: { id: 42, ward_id: 1, code: 'S02', name: 'नयाँ बस्ती', is_active: 1 } };
      if (path === '/wards') return { data: [{ id: 1, ward_no: 1, name: 'वडा नं. १' }] };
      if (path === '/wards/1/settlements') return { data: cachedSettlements };
      throw new Error(`Unexpected API request: ${path}`);
    });
  });

  it('lets an assigned-ward user add a named settlement and selects its generated code', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><HouseholdNew /></MemoryRouter>);

    await screen.findByRole('option', { name: /S01 – पुरानो टोल/ });
    await user.click(screen.getByRole('button', { name: 'बस्ती थप्नुहोस्' }));
    await user.type(screen.getByRole('textbox', { name: 'नयाँ बस्तीको नाम' }), 'नयाँ बस्ती');
    await user.click(screen.getByRole('button', { name: 'थप्नुहोस्' }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/settlements', {
      method: 'POST',
      body: { name: 'नयाँ बस्ती' },
    }));
    expect(storeMocks.cacheSettlement).toHaveBeenCalledWith(7, expect.objectContaining({ code: 'S02' }));
    expect(await screen.findByRole('option', { name: 'S02 – नयाँ बस्ती' })).toBeInTheDocument();
    expect(screen.getByLabelText('बस्ती कोड / नाम *')).toHaveValue('42');
    expect(screen.getByText('बस्ती थपियो (S02)')).toBeInTheDocument();
  });
});
