import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setLanguage } from '@shared/i18n/index.js';
import { AccessDeniedPage, AppErrorBoundary, NotFoundPage, OfflinePage } from '../pages/ErrorPages.jsx';

const { offlineMock, apiMock } = vi.hoisted(() => ({
  offlineMock: vi.fn(),
  apiMock: vi.fn(),
}));

vi.mock('../lib/offline.jsx', () => ({ useOffline: offlineMock }));
vi.mock('../lib/api.js', () => ({ api: apiMock }));

function renderWithRoutes(page, initialPath = '/missing') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<p>Dashboard destination</p>} />
        <Route path="/offline" element={page} />
        <Route path="*" element={page} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Smart Mayadevi error pages', () => {
  beforeEach(() => {
    setLanguage('ne');
    apiMock.mockReset();
    offlineMock.mockReturnValue({ engine: null, enabled: false, state: null });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
  });

  it('shows a branded 404 and the dashboard action navigates to the real dashboard route', async () => {
    renderWithRoutes(<NotFoundPage standalone />);

    expect(screen.getByRole('heading', { name: 'पृष्ठ भेटिएन' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'नेपाल सरकार' })).toHaveAttribute('src', '/municipal/nepal-government-emblem.png');
    fireEvent.click(screen.getByRole('link', { name: 'ड्यासबोर्ड' }));
    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument();
  });

  it('renders the access-denied state with navigation options', () => {
    renderWithRoutes(<AccessDeniedPage />);

    expect(screen.getByRole('heading', { name: 'पहुँच अस्वीकृत' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /पछाडि जानुहोस्/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ड्यासबोर्ड' })).toBeInTheDocument();
  });

  it('retries real offline sync and reports queued records from the sync state', async () => {
    const engine = { sync: vi.fn().mockResolvedValue({ ok: true, sent: 2 }) };
    offlineMock.mockReturnValue({
      engine, enabled: true, state: { status: 'idle', pending: 2, lastSync: null },
    });
    renderWithRoutes(<OfflinePage />, '/offline');

    expect(screen.getByText('२')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'पुनः जडान गर्नुहोस्' }));

    await waitFor(() => expect(engine.sync).toHaveBeenCalledWith({ force: true }));
    expect(await screen.findByText('जडान सफल भयो। बाँकी अभिलेखहरू सिंक गरिएका छन्।')).toBeInTheDocument();
  });

  it('does not attempt a sync while the browser is offline', async () => {
    const engine = { sync: vi.fn() };
    offlineMock.mockReturnValue({ engine, enabled: true, state: { status: 'offline', pending: 3 } });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    renderWithRoutes(<OfflinePage />, '/offline');

    fireEvent.click(screen.getByRole('button', { name: 'पुनः जडान गर्नुहोस्' }));
    expect(await screen.findByText('इन्टरनेट जडान उपलब्ध छैन। जडान भएपछि पुनः प्रयास गर्नुहोस्।')).toBeInTheDocument();
    expect(engine.sync).not.toHaveBeenCalled();
  });

  it('catches an application rendering failure and presents the 500 retry state', () => {
    const error = new Error('test render failure');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    function BrokenPage() { throw error; }

    render(
      <MemoryRouter>
        <AppErrorBoundary><BrokenPage /></AppErrorBoundary>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'प्रणालीमा अस्थायी समस्या' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /पुनः प्रयास गर्नुहोस्/ })).toBeEnabled();
    expect(errorSpy).toHaveBeenCalledWith('Unhandled application rendering error:', error, expect.anything());
    errorSpy.mockRestore();
  });
});
