import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setLanguage } from '@shared/i18n/index.js';
import Wards from '../pages/admin/Wards.jsx';

const { apiMock, reloadMock, settlementsReloadMock } = vi.hoisted(() => ({
  apiMock: vi.fn(),
  reloadMock: vi.fn(),
  settlementsReloadMock: vi.fn(),
}));

vi.mock('../lib/api.js', () => ({ api: apiMock }));
vi.mock('../lib/useFetch.js', () => ({
  useFetch: (path) => path === '/wards'
    ? { data: { data: [{ id: 1, ward_no: 1, name: 'पुरानो नाम', is_active: true, settlement_count: 2, household_count: 9 }] }, error: null, loading: false, reload: reloadMock }
    : { data: { data: [] }, error: null, loading: false, reload: settlementsReloadMock },
}));

describe('ward CRUD controls', () => {
  beforeEach(() => {
    setLanguage('ne');
    apiMock.mockReset().mockResolvedValue({ data: {} });
    reloadMock.mockReset().mockResolvedValue(undefined);
    settlementsReloadMock.mockReset().mockResolvedValue(undefined);
  });

  it('updates the selected ward number and name', async () => {
    const user = userEvent.setup();
    render(<Wards />);

    await user.click(screen.getByRole('button', { name: 'सम्पादन: वडा नं. १' }));
    await user.clear(screen.getByRole('textbox', { name: 'वडा नं.' }));
    await user.type(screen.getByRole('textbox', { name: 'वडा नं.' }), '२');
    await user.clear(screen.getByPlaceholderText('नाम (ऐच्छिक)'));
    await user.type(screen.getByPlaceholderText('नाम (ऐच्छिक)'), 'नयाँ नाम');
    await user.click(screen.getByRole('button', { name: 'सुरक्षित गर्नुहोस्' }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/wards/1', {
      method: 'PATCH',
      body: { ward_no: 2, name: 'नयाँ नाम' },
    }));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('requires confirmation before soft-deleting a ward', async () => {
    const user = userEvent.setup();
    render(<Wards />);

    await user.click(screen.getByRole('button', { name: 'निष्क्रिय गर्नुहोस्: वडा नं. १' }));
    expect(apiMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'निष्क्रिय गर्नुहोस्', exact: true }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith('/wards/1', {
      method: 'PATCH',
      body: { is_active: false },
    }));
    expect(reloadMock).toHaveBeenCalled();
  });
});
