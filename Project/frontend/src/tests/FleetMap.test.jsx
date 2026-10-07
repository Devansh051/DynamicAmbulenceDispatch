import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import GoogleMapView from '../components/GoogleMapView';

afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); document.getElementById('google-maps-script')?.remove(); });

test('Google fleet layer reuses markers, updates positions and removes departed vehicles', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_API_KEY', 'mock-map-key');
  const markers = [];
  const maps = {
    Map: vi.fn(function () { this.setCenter = vi.fn(); }),
    Circle: vi.fn(function () { this.setCenter = vi.fn(); this.setRadius = vi.fn(); this.setMap = vi.fn(); }),
    Marker: vi.fn(function () {
      this.setPosition = vi.fn(); this.setIcon = vi.fn(); this.setTitle = vi.fn(); this.setMap = vi.fn(); this.addListener = vi.fn();
      markers.push(this);
    }),
    InfoWindow: vi.fn(function () { this.setContent = vi.fn(); this.open = vi.fn(); this.close = vi.fn(); }),
    SymbolPath: { FORWARD_CLOSED_ARROW: 'arrow' }
  };
  vi.stubGlobal('google', { maps });
  const first = { ambulance_id: 1, latitude: 12.97, longitude: 77.59, health: 'ONLINE', operational_status: 'AVAILABLE' };
  const second = { ...first, ambulance_id: 2, latitude: 12.98 };
  const props = { center: { lat: 12.97, lng: 77.59 }, fleet: [first, second] };
  const view = render(<GoogleMapView {...props} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalledTimes(2));
  view.rerender(<GoogleMapView {...props} fleet={[{ ...first, latitude: 13, health: 'OFFLINE' }]} />);
  expect(maps.Map).toHaveBeenCalledTimes(1);
  expect(maps.Marker).toHaveBeenCalledTimes(2);
  expect(markers[0].setPosition).toHaveBeenLastCalledWith({ lat: 13, lng: 77.59 });
  expect(markers[0].setIcon).toHaveBeenLastCalledWith(expect.objectContaining({ fillColor: '#64748B' }));
  expect(markers[1].setMap).toHaveBeenCalledWith(null);
  view.unmount();
  expect(markers[0].setMap).toHaveBeenCalledWith(null);
});


test('hospital popup treats directory text as text, and rejects coerced coordinates', async () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_API_KEY', 'mock-map-key');
  const maps = {
    Map: vi.fn(function () { this.setCenter = vi.fn(); }),
    Circle: vi.fn(function () { this.setCenter = vi.fn(); this.setRadius = vi.fn(); this.setMap = vi.fn(); }),
    Marker: vi.fn(function () { this.setMap = vi.fn(); this.addListener = vi.fn(); }),
    InfoWindow: vi.fn(function () { this.open = vi.fn(); }),
    SymbolPath: { CIRCLE: 'circle', BACKWARD_CLOSED_ARROW: 'arrow' }
  };
  vi.stubGlobal('google', { maps });
  render(<GoogleMapView hospitals={[
    { HospitalID: 1, latitude: 12.97, longitude: 77.59, HospitalName: '<img src=x onerror=alert(1)>', Location: '<script>bad()</script>' },
    { HospitalID: 2, latitude: false, longitude: [], HospitalName: 'Invalid position' }
  ]} />);
  await waitFor(() => expect(maps.Marker).toHaveBeenCalledTimes(2));
  const popup = maps.InfoWindow.mock.calls[1][0].content;
  expect(popup).toContain('&lt;img');
  expect(popup).toContain('&lt;script&gt;');
  expect(popup).not.toContain('<img');
  expect(popup).not.toContain('<script>');
});


test('a stalled Google script shows a bounded loading state then the explicit vector fallback', () => {
  vi.useFakeTimers();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('VITEST', '');
  vi.stubEnv('VITE_GOOGLE_MAPS_BROWSER_API_KEY', 'mock-map-key');
  vi.stubGlobal('google', undefined);
  render(<GoogleMapView />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading map');
  act(() => vi.advanceTimersByTime(15000));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText('Google Maps unavailable. Vector view active.')).toBeInTheDocument();
});
