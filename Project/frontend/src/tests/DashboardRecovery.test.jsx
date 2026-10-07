import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import DashboardPage from '../pages/DashboardPage';
import { healthService } from '../services/healthService';

const auth = vi.hoisted(() => ({ user: { role: 'ADMIN' } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../services/healthService', () => ({ healthService: { getHealth: vi.fn(), getOverview: vi.fn() } }));
vi.mock('../components/FleetDigitalTwinPanel', () => ({ default: () => <div>Authorized fleet map</div> }));

beforeEach(() => { vi.clearAllMocks(); auth.user = { role: 'ADMIN' }; });

test('dashboard outage shows unknown metrics rather than fabricated healthy defaults', async () => {
  healthService.getHealth.mockRejectedValue(new Error('Unavailable'));
  healthService.getOverview.mockRejectedValue(new Error('Unavailable'));
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  await screen.findByRole('alert');
  expect(screen.getByText('COMMAND SERVICES DEGRADED')).toBeInTheDocument();
  expect(screen.queryByText('COMMAND SERVICES READY')).not.toBeInTheDocument();
  expect(screen.getByText('-- Standby')).toBeInTheDocument();
  expect(screen.getByText('Authorized fleet map')).toBeInTheDocument();
});

test('crew dashboard neither requests nor opens the dispatcher fleet feed', () => {
  auth.user = { role: 'AMBULANCE_CREW' };
  render(<MemoryRouter><DashboardPage /></MemoryRouter>);
  expect(screen.getByText('Operations access')).toBeInTheDocument();
  expect(healthService.getOverview).not.toHaveBeenCalled();
  expect(screen.queryByText('Authorized fleet map')).not.toBeInTheDocument();
});
