import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthContext from '../context/AuthContext';
import GoogleMapView from '../components/GoogleMapView';
import HospitalSyncModal from '../components/HospitalSyncModal';
import HospitalsPage from '../pages/HospitalsPage';
import * as hospitalService from '../services/hospitalService';
import * as ambulanceService from '../services/ambulanceService';

const { mockHospitalService, mockAmbulanceService } = vi.hoisted(() => {
  return {
    mockHospitalService: {
      getHospitals: vi.fn(),
      getHospital: vi.fn(),
      createHospital: vi.fn(),
      updateHospital: vi.fn(),
      updateStatus: vi.fn(),
      getNearbyHospitals: vi.fn(),
      triggerSync: vi.fn(),
      getSyncStatus: vi.fn(),
      getSyncHistory: vi.fn()
    },
    mockAmbulanceService: {
      getAmbulances: vi.fn()
    }
  };
});

vi.mock('../services/hospitalService', () => ({
  default: mockHospitalService,
  hospitalService: mockHospitalService
}));

vi.mock('../services/ambulanceService', () => ({
  default: mockAmbulanceService,
  ambulanceService: mockAmbulanceService
}));

describe('Phase 4: Frontend Google Maps & Government Directory Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. GoogleMapView Component', () => {
    const mockHospitals = [
      {
        HospitalID: 1,
        name: 'Victoria Hospital Trauma Center',
        latitude: 12.9630,
        longitude: 77.5750,
        distance_km: 2.4,
        duration_minutes: 8,
        data_source: 'GOV_DIRECTORY'
      },
      {
        HospitalID: 2,
        name: 'St. Martha\'s Hospital',
        latitude: 12.9710,
        longitude: 77.5850,
        distance_km: 1.2,
        duration_minutes: 5,
        data_source: 'GOOGLE_PLACES'
      }
    ];

    it('renders tactical vector radar view when browser API key is omitted', () => {
      render(
        <GoogleMapView
          center={{ lat: 12.9716, lng: 77.5946 }}
          hospitals={mockHospitals}
          radiusMeters={15000}
        />
      );

      expect(screen.getByText(/EMS Tactical Radar & Vector View/i)).toBeInTheDocument();
      expect(screen.getByText(/15 km scan/i)).toBeInTheDocument();
      expect(screen.getByText(/NIN Directory/i)).toBeInTheDocument();
      expect(screen.getByText(/Google Places/i)).toBeInTheDocument();
      expect(screen.getByText(/Cross-Matched/i)).toBeInTheDocument();
    });

    it('renders radar distance rings and plots hospital markers', () => {
      const onSelect = vi.fn();
      const { container } = render(
        <GoogleMapView
          center={{ lat: 12.9716, lng: 77.5946 }}
          hospitals={mockHospitals}
          selectedHospital={mockHospitals[0]}
          onSelectHospital={onSelect}
          radiusMeters={15000}
        />
      );

      const svg = container.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });
  });

  describe('2. HospitalSyncModal Component', () => {
    const mockSyncStatus = {
      is_running: false,
      sync_interval_days: 3,
      last_sync: { started_at: '2026-09-30T08:00:00Z' },
      last_successful_sync: {
        sync_id: 'sync-gov-test-01',
        completed_at: '2026-09-30T08:02:15Z',
        duration_ms: 13500,
        total_fetched: 50,
        records_inserted: 12,
        records_updated: 35,
        records_skipped: 3,
        records_failed: 0
      },
      next_scheduled_sync: '2026-10-03T08:00:00Z'
    };

    const mockSyncHistory = {
      history: [
        {
          id: 1,
          sync_id: 'sync-gov-test-01',
          trigger_type: 'SCHEDULED',
          started_at: '2026-09-30T08:00:00Z',
          duration_ms: 13500,
          status: 'COMPLETED',
          records_inserted: 12,
          records_updated: 35
        }
      ],
      pagination: { total: 1, page: 1, limit: 5, totalPages: 1 }
    };

    it('renders synchronization telemetry cards, 3-day interval, and history table', async () => {
      mockHospitalService.getSyncStatus.mockResolvedValue(mockSyncStatus);
      mockHospitalService.getSyncHistory.mockResolvedValue(mockSyncHistory);

      render(<HospitalSyncModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Government Directory Synchronization/i)).toBeInTheDocument();
        expect(screen.getByText(/Ready \(Active\)/i)).toBeInTheDocument();
        expect(screen.getByText(/every 3 days \(72h\)/i)).toBeInTheDocument();
        expect(screen.getByText(/Latest Ingestion Telemetry/i)).toBeInTheDocument();
        expect(screen.getByText(/Trigger Sync Now/i)).toBeInTheDocument();
      });
    });

    it('triggers manual synchronization when admin clicks trigger button', async () => {
      mockHospitalService.getSyncStatus.mockResolvedValue(mockSyncStatus);
      mockHospitalService.getSyncHistory.mockResolvedValue(mockSyncHistory);
      mockHospitalService.triggerSync.mockResolvedValue({
        success: true,
        syncJob: { records_inserted: 8, records_updated: 15 }
      });

      render(<HospitalSyncModal isOpen={true} onClose={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText(/Trigger Sync Now/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Trigger Sync Now/i));

      await waitFor(() => {
        expect(mockHospitalService.triggerSync).toHaveBeenCalled();
      });
    });
  });

  describe('3. HospitalsPage Nearby & Synchronization Integration', () => {
    const mockHospitalsList = {
      hospitals: [
        {
          HospitalID: 101,
          HospitalName: 'Bowring and Lady Curzon Hospital',
          address: 'Shivajinagar, Bengaluru',
          Location: 'Shivajinagar, Bengaluru',
          facility_type: 'GENERAL_HOSPITAL',
          ownership: 'PUBLIC',
          is_active: true,
          stationedAmbulances: []
        }
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 }
    };

    const mockAmbulancesList = {
      ambulances: [
        {
          AmbulanceID: 1,
          fleet_code: 'AMB-BLR-001',
          Status: 'Available',
          current_location_lat: 12.9716,
          current_location_lng: 77.5946
        }
      ]
    };

    const mockNearbyResponse = {
      ambulance: { AmbulanceID: 1, fleet_code: 'AMB-BLR-001' },
      search_center: { latitude: 12.9716, longitude: 77.5946 },
      radius_meters: 15000,
      total_candidates: 1,
      hospitals: [
        {
          HospitalID: 101,
          name: 'Bowring and Lady Curzon Hospital',
          address: 'Shivajinagar, Bengaluru',
          latitude: 12.9815,
          longitude: 77.6045,
          distance_km: 2.1,
          duration_minutes: 7,
          data_source: 'MATCHED_BOTH',
          verification_status: 'CROSS_MATCHED'
        }
      ]
    };

    it('renders Gov Directory Sync button for ADMIN role and toggles sync modal', async () => {
      mockHospitalService.getHospitals.mockResolvedValue(mockHospitalsList);
      mockHospitalService.getSyncStatus.mockResolvedValue({ is_running: false, sync_interval_days: 3 });
      mockHospitalService.getSyncHistory.mockResolvedValue({ history: [], pagination: {} });
      mockAmbulanceService.getAmbulances.mockResolvedValue(mockAmbulancesList);

      const authAdmin = {
        user: { id: 1, name: 'Admin User', role: 'ADMIN' },
        role: 'ADMIN',
        isAuthenticated: true
      };

      render(
        <BrowserRouter>
          <AuthContext.Provider value={authAdmin}>
            <HospitalsPage />
          </AuthContext.Provider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Gov Directory Sync/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Gov Directory Sync/i));

      await waitFor(() => {
        expect(screen.getByText(/Government Directory Synchronization/i)).toBeInTheDocument();
      });
    });

    it('switches to Nearby Discovery & Radar view and performs scan', async () => {
      mockHospitalService.getHospitals.mockResolvedValue(mockHospitalsList);
      mockHospitalService.getNearbyHospitals.mockResolvedValue(mockNearbyResponse);
      mockAmbulanceService.getAmbulances.mockResolvedValue(mockAmbulancesList);

      const authAdmin = {
        user: { id: 1, name: 'Admin User', role: 'ADMIN' },
        role: 'ADMIN',
        isAuthenticated: true
      };

      render(
        <BrowserRouter>
          <AuthContext.Provider value={authAdmin}>
            <HospitalsPage />
          </AuthContext.Provider>
        </BrowserRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Nearby Discovery & Radar/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Nearby Discovery & Radar/i));

      await waitFor(() => {
        expect(screen.getByText(/Scan Nearby Facilities/i)).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText(/Scan Nearby Facilities/i));

      await waitFor(() => {
        expect(mockHospitalService.getNearbyHospitals).toHaveBeenCalled();
      });
    });
  });
});
