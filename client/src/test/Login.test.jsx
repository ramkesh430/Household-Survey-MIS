import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setLanguage } from '@shared/i18n/index.js';
import Login from '../pages/Login.jsx';
import LanguageSwitcher from '../components/municipal/LanguageSwitcher.jsx';

const { loginMock, switchLanguageMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  switchLanguageMock: vi.fn(),
}));

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ login: loginMock }),
}));

vi.mock('../lib/i18n.js', () => ({
  switchLanguage: switchLanguageMock,
}));

function renderLogin(path = '/login') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<p>Dashboard destination</p>} />
        <Route path="/change-password" element={<p>Change password destination</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Smart Mayadevi login', () => {
  beforeEach(() => {
    setLanguage('ne');
    loginMock.mockReset();
    switchLanguageMock.mockReset();
    loginMock.mockResolvedValue({ must_change_password: false });
  });

  it('requires both credentials and prevents submitting an empty form', async () => {
    const user = userEvent.setup();
    renderLogin();

    const submit = screen.getByRole('button', { name: 'लगइन' });
    expect(screen.getByLabelText('प्रयोगकर्ता नाम')).toBeRequired();
    expect(screen.getByLabelText('पासवर्ड')).toBeRequired();
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText('प्रयोगकर्ता नाम'), 'staff');
    expect(submit).toBeDisabled();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('submits normalized usernames through the existing auth flow and navigates to the dashboard', async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(screen.getByLabelText('प्रयोगकर्ता नाम'), '  FieldOfficer  ');
    await user.type(screen.getByLabelText('पासवर्ड'), 'private-pass');
    await user.click(screen.getByRole('button', { name: 'लगइन' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('fieldofficer', 'private-pass'));
    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument();
  });

  it('routes first-login password changes to the existing password update page', async () => {
    const user = userEvent.setup();
    loginMock.mockResolvedValueOnce({ must_change_password: true });
    renderLogin();

    await user.type(screen.getByLabelText('प्रयोगकर्ता नाम'), 'enumerator');
    await user.type(screen.getByLabelText('पासवर्ड'), 'private-pass');
    await user.click(screen.getByRole('button', { name: 'लगइन' }));

    expect(await screen.findByText('Change password destination')).toBeInTheDocument();
  });

  it('shows authentication failures and preserves the administrator reset workflow', async () => {
    const user = userEvent.setup();
    loginMock.mockRejectedValueOnce(Object.assign(new Error('लगइन विवरण मिलेन'), { status: 401 }));
    renderLogin();

    await user.type(screen.getByLabelText('प्रयोगकर्ता नाम'), 'enumerator');
    await user.type(screen.getByLabelText('पासवर्ड'), 'incorrect-pass');
    await user.click(screen.getByRole('button', { name: 'लगइन' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('लगइन विवरण मिलेन');

    await user.click(screen.getByRole('button', { name: 'पासवर्ड बिर्सनुभयो?' }));
    expect(screen.getByRole('status')).toHaveTextContent('प्रणाली प्रशासकसँग सम्पर्क गर्नुहोस्');
  });

  it('offers language switching through the existing language utility', () => {
    render(<LanguageSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: 'View in English' }));
    expect(switchLanguageMock).toHaveBeenCalledWith('en');
  });
});
