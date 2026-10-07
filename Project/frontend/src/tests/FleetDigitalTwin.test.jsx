import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import FleetDigitalTwinPanel from '../components/FleetDigitalTwinPanel';
import fleetService from '../services/fleetService';
import { ageFleetState, hasFleetCoordinates, mergeFleetSnapshot, mergeFleetState } from '../services/fleetState';

vi.mock('../services/fleetService', () => ({ default: { getSnapshot: vi.fn(), connect: vi.fn() } }));
vi.mock('../components/GoogleMapView', () => ({ default: ({ fleet }) => <div data-testid="fleet-map">{fleet.map((vehicle) => vehicle.latitude).join(',')}</div> }));
const first = { ambulance_id: 1, fleet_code: 'SIM-ONE', is_simulated: true, latitude: 12.9, longitude: 77.6,
  revision: 1, epoch: 'one', health: 'ONLINE', operational_status: 'AVAILABLE', observed_at: '2026-10-03T00:00:00Z',
  last_gps_at: '2026-10-03T00:00:00Z', last_heartbeat_at: '2026-10-03T00:00:00Z' };
let handlers;
let disconnect;
beforeEach(() => {
  vi.clearAllMocks();
  disconnect = vi.fn();
  fleetService.getSnapshot.mockResolvedValue({ fleet: [first] });
  fleetService.connect.mockImplementation((callbacks) => { handlers = callbacks; return { disconnect }; });
});
test('snapshot initializes fleet, updates move markers, and reconnect preserves newer state', async () => {
  const view = render(<FleetDigitalTwinPanel />);
  await screen.findByText('SIM-ONE');
  act(() => handlers.onConnect());
  act(() => handlers.onUpdate({ ...first, latitude: 13, revision: 2, health: 'LOCATION_STALE' }));
  expect(screen.getByTestId('fleet-map')).toHaveTextContent('13');
  expect(screen.getByText('Location stale')).toBeInTheDocument();
  act(() => handlers.onSnapshot({ fleet: [first] }));
  expect(screen.getByTestId('fleet-map')).toHaveTextContent('13');
  act(() => handlers.onDisconnect());
  expect(screen.getByText('LAST SNAPSHOT')).toBeInTheDocument();
  act(() => { handlers.onConnect(); handlers.onSnapshot({ fleet: [{ ...first, revision: 3, health: 'OFFLINE' }] }); });
  await waitFor(() => expect(screen.getAllByText('Offline').length).toBeGreaterThan(0));
  view.unmount();
  expect(disconnect).toHaveBeenCalled();
});
test('delayed HTTP snapshot cannot overwrite a newer live event', async () => {
  let resolve;
  fleetService.getSnapshot.mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<FleetDigitalTwinPanel />);
  act(() => handlers.onUpdate({ ...first, revision: 5, latitude: 14 }));
  await act(async () => resolve({ fleet: [first] }));
  expect(screen.getByTestId('fleet-map')).toHaveTextContent('14');
});
test('empty and error states remain actionable', async () => {
  fleetService.getSnapshot.mockResolvedValue({ fleet: [] });
  render(<FleetDigitalTwinPanel />);
  await screen.findByText('No fleet telemetry is available yet.');
  act(() => handlers.onError({ message: 'Connection interrupted' }));
  expect(screen.getByText('Connection interrupted')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Refresh fleet snapshot' })).toBeEnabled();
});
test('reducer supports Redis restart epochs and never maps absent coordinates to zero', () => {
  expect(hasFleetCoordinates({ latitude: null, longitude: null })).toBe(false);
  expect(hasFleetCoordinates({ latitude: '', longitude: ' ' })).toBe(false);
  expect(hasFleetCoordinates({ latitude: 0, longitude: 0 })).toBe(true);
  expect(mergeFleetSnapshot([{ ...first, revision: 9 }], [first])[0].revision).toBe(9);
  const restarted = mergeFleetState([{ ...first, revision: 99 }], { ...first, epoch: 'two', revision: 1, observed_at: '2026-10-03T00:01:00Z' });
  expect(restarted[0].epoch).toBe('two');
});

test('fleet health ages without new events using server time and configured thresholds', () => {
  const received = { ...first, received_at_client: 1000, location_stale_ms: 5000, offline_ms: 10000 };
  expect(ageFleetState(received, 1000).health).toBe('ONLINE');
  expect(ageFleetState(received, 6001).health).toBe('LOCATION_STALE');
  expect(ageFleetState(received, 11001).health).toBe('OFFLINE');
  expect(ageFleetState({ ...received, health: 'OFFLINE' }, 1000).health).toBe('OFFLINE');
});

test('vehicle simulation and historical position are explicitly labeled', async () => {
  fleetService.getSnapshot.mockResolvedValue({ fleet: [{ ...first, restored_from_database: true, last_heartbeat_at: null }] });
  render(<FleetDigitalTwinPanel />);
  await screen.findByText('Simulated vehicle');
  expect(screen.getByText('Historical position, not live GPS')).toBeInTheDocument();
});


test('a connected socket with unavailable Redis clearly shows last known state', async () => {
  render(<FleetDigitalTwinPanel />);
  await screen.findByText('SIM-ONE');
  act(() => { handlers.onConnect(); handlers.onSnapshot({ fleet: [first], redis_live: false }); });
  expect(screen.getByText('LAST SNAPSHOT')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Live fleet storage unavailable');
  act(() => handlers.onSnapshot({ fleet: [{ ...first, revision: 2 }], redis_live: true }));
  expect(screen.getByText('LIVE CONNECTED')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
test('older health events and previous epochs never replace newer telemetry', () => {
  const newer = { ...first, revision: 3, observed_at: '2026-10-03T00:02:00Z' };
  expect(mergeFleetState([newer], { ...first, revision: 3, health: 'OFFLINE' })[0].health).toBe('ONLINE');
  expect(mergeFleetState([newer], { ...first, epoch: 'old', revision: 999 })[0].epoch).toBe('one');
  expect(hasFleetCoordinates({ latitude: false, longitude: true })).toBe(false);
});
