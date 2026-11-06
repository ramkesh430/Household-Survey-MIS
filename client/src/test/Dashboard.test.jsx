import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { setLanguage } from '@shared/i18n/index.js';
import Dashboard from '../pages/Dashboard.jsx';

const { fetchMock, userMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  userMock: { id: 1, role: 'supervisor', full_name: 'Test Supervisor', ward_id: 1 },
}));

vi.mock('../lib/auth.jsx', () => ({
  useAuth: () => ({ user: userMock }),
  ROLE_LABEL: { admin: 'प्रशासक', supervisor: 'सुपरभाइजर', enumerator: 'गणक' },
}));

vi.mock('../lib/offline.jsx', () => ({
  useOffline: () => ({ enabled: false, state: null }),
  useAfterSync: () => {},
}));

vi.mock('../lib/useFetch.js', () => ({ useFetch: fetchMock }));

const days = Array.from({ length: 30 }, (_, i) => ({
  day: `2026-10-${String(i + 1).padStart(2, '0')}`,
  submitted: i === 28 ? 2 : 0,
  approved: i === 29 ? 1 : 0,
  registered: i === 29 ? 1 : 0,
}));

function overviewData(households = 12) {
  return {
    data: {
      data: {
        totals: { households, started: households ? 7 : 0, draft: households ? 1 : 0, submitted: households ? 2 : 0, approved: households ? 3 : 0, rejected: households ? 1 : 0, population: households ? 12 : 0 },
        demography: [
          { id: 'population', value: households ? 12 : 0 },
          { id: 'male', value: households ? 5 : 0 },
          { id: 'female', value: households ? 7 : 0 },
          { id: 'avg_size', value: households ? 4 : 0 },
        ],
        wards: households ? [{ ward_id: 1, ward_no: 1, households, started: 7, draft: 1, submitted: 2, approved: 3, rejected: 1 }] : [],
        days,
        householdDays: days,
        pyramid: {
          rows: [{ key: '25_45', label: '२५ वर्षसम्म' }],
          cells: { '25_45': { female: 7, male: 5 } },
        },
        generatedAt: '2026-11-05T12:00:00.000Z',
      },
    },
    loading: false,
    error: null,
    reload: vi.fn(),
  };
}

describe('Dashboard', () => {
  beforeEach(() => {
    setLanguage('ne');
    userMock.role = 'supervisor';
    fetchMock.mockImplementation((path) => {
      if (path?.startsWith('/reports/overview')) return overviewData();
      if (path?.startsWith('/surveys?page=')) return { data: { data: [] }, loading: false, error: null };
      if (path === '/health') return { data: { status: 'ok', db: 'ok' }, loading: false, error: null };
      return { data: { data: [] }, loading: false, error: null };
    });
  });

  it('renders role-scoped real summary metrics, charts, activity and truthful GIS fallback', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'ड्यासबोर्ड' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /दर्ता घरधुरी/ })).toHaveTextContent('१२');
    expect(screen.getByRole('link', { name: /सर्वेक्षण सम्पन्न/ })).toHaveTextContent('३');
    expect(screen.getByText('वडागत सर्वेक्षण प्रगति')).toBeInTheDocument();
    expect(screen.getByText('विगत ३० दिनमा घरधुरी दर्ता')).toBeInTheDocument();
    expect(screen.getByText('लिङ्गअनुसार जनसंख्या')).toBeInTheDocument();
    expect(screen.getByText(/प्रमाणित वडा सीमारेखा GeoJSON उपलब्ध नभएकाले/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/^\/reports\/overview/));
  });

  it('shows a real empty state when no households are registered', () => {
    fetchMock.mockImplementation((path) => {
      if (path?.startsWith('/reports/overview')) return overviewData(0);
      return { data: { data: [] }, loading: false, error: null };
    });
    render(<MemoryRouter><Dashboard /></MemoryRouter>);

    expect(screen.getAllByText('घरधुरी दर्ता भएको छैन।').length).toBeGreaterThan(0);
    expect(screen.getByText('जनसंख्या तथ्यांक उपलब्ध छैन।')).toBeInTheDocument();
  });
});
