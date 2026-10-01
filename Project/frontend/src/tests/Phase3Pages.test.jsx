import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthContext from '../context/AuthContext';
import AmbulancesPage from '../pages/AmbulancesPage';
import HospitalsPage from '../pages/HospitalsPage';
import EmergenciesPage from '../pages/EmergenciesPage';
import ServiceZonesPage from '../pages/ServiceZonesPage';

import * as ambulanceService from '../services/ambulanceService';
import * as hospitalService from '../services/hospitalService';
import * as emergencyService from '../services/emergencyService';
import * as zoneService from '../services/zoneService';

const { mockAmbulanceService, mockHospitalService, mockEmergencyService, mockZoneService } = vi.hoisted(() => {
  const amb = {
    getAmbulances: vi.fn(),
    getAmbulanceById: vi.fn(),
    createAmbulance: vi.fn(),
    updateAmbulance: vi.fn(),
    updateAmbulanceStatus: vi.fn()
  };
  const hosp = {
    getHospitals: vi.fn(),
    getHospitalById: vi.fn(),
    createHospital: vi.fn(),
    updateHospital: vi.fn(),
    updateHospitalStatus: vi.fn()
  };
  const emg = {
    getEmergencies: vi.fn(),
    getEmergencyById: vi.fn(),
    createEmergency: vi.fn(),
    updateEmergency: vi.fn(),
    updateEmergencyStatus: vi.fn(),
    cancelEmergency: vi.fn()
  };
  const zn = {
    getZones: vi.fn(),
    getZoneById: vi.fn(),
    createZone: vi.fn(),
    updateZone: vi.fn(),
    toggleZoneStatus: vi.fn()
  };

  return {
    mockAmbulanceService: amb,
    mockHospitalService: hosp,
    mockEmergencyService: emg,
    mockZoneService: zn
  };
});

vi.mock('../services/ambulanceService', () => ({
  ...mockAmbulanceService,
  default: mockAmbulanceService
}));

vi.mock('../services/hospitalService', () => ({
  ...mockHospitalService,
  default: mockHospitalService
}));

vi.mock('../services/emergencyService', () => ({
  ...mockEmergencyService,
  default: mockEmergencyService
}));

vi.mock('../services/zoneService', () => ({
  ...mockZoneService,
  default: mockZoneService
}));

const renderWithAuth = (component, role = 'ADMIN') => {
  const authValues = {
    user: { id: 1, name: 'Lead Admin', email: 'admin@ems.local', role, status: 'ACTIVE' },
    role,
    isAuthenticated: true,
    isLoading: false,
    logout: vi.fn()
  };

  return render(
    <AuthContext.Provider value={authValues}>
      <BrowserRouter>
        {component}
      </BrowserRouter>
    </AuthContext.Provider>
  );
};

describe('Phase 3 Management Pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AmbulancesPage', () => {
    it('renders ambulance fleet list and summary cards', async () => {
      mockAmbulanceService.getAmbulances.mockResolvedValue({
        ambulances: [
          {
            id: 1,
            legacy_id: 1,
            fleet_code: 'AMB-001',
            vehicle_type: 'ALS',
            registration_number: 'KA-01-EQ-1001',
            status: 'available',
            fuel_level: 85,
            current_location_lat: 12.9716,
            current_location_lng: 77.5946,
            current_hospital_id: 1,
            is_active: true
          }
        ],
        pagination: { total: 1, page: 1, limit: 12, pages: 1 }
      });

      mockHospitalService.getHospitals.mockResolvedValue({
        hospitals: [{ id: 1, name: 'Apollo Hospitals Bannerghatta' }],
        pagination: { total: 1, page: 1, limit: 100, pages: 1 }
      });

      renderWithAuth(<AmbulancesPage />);

      expect(screen.getByText('Ambulance Fleet Directory & Telemetry')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('AMB-001')).toBeInTheDocument();
        expect(screen.getByText('KA-01-EQ-1001')).toBeInTheDocument();
      });
    });

    it('opens commissioning modal when button is clicked', async () => {
      mockAmbulanceService.getAmbulances.mockResolvedValue({ ambulances: [], pagination: { total: 0 } });
      mockHospitalService.getHospitals.mockResolvedValue({ hospitals: [], pagination: { total: 0 } });

      renderWithAuth(<AmbulancesPage />);

      const commissionBtn = screen.getByText('Commission Unit');
      fireEvent.click(commissionBtn);

      expect(screen.getByText('Commission New Ambulance Unit')).toBeInTheDocument();
    });
  });

  describe('HospitalsPage', () => {
    it('renders hospital directory and badges', async () => {
      mockHospitalService.getHospitals.mockResolvedValue({
        hospitals: [
          {
            id: 1,
            HospitalID: 1,
            legacy_id: 1,
            name: 'Apollo Hospitals Bannerghatta',
            HospitalName: 'Apollo Hospitals Bannerghatta',
            city: 'Bengaluru',
            state: 'Karnataka',
            address: 'Bannerghatta Main Road',
            facility_type: 'TRAUMA_CENTER_LEVEL_1',
            ownership: 'PRIVATE',
            phone: '+91-80-2630-4050',
            total_beds: 250,
            available_beds: 42,
            is_active: true,
            data_source: 'SEED'
          }
        ],
        pagination: { total: 1, page: 1, limit: 12, pages: 1 }
      });

      renderWithAuth(<HospitalsPage />);

      expect(screen.getByText('Hospital Network & Trauma Centers')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Apollo Hospitals Bannerghatta')).toBeInTheDocument();
        expect(screen.getByText('Bannerghatta Main Road')).toBeInTheDocument();
      });
    });
  });

  describe('EmergenciesPage', () => {
    it('renders emergency incident queue with priority labels', async () => {
      mockEmergencyService.getEmergencies.mockResolvedValue({
        emergencies: [
          {
            id: 1,
            incident_code: 'INC-20260930-1001',
            emergency_type: 'CARDIAC',
            severity: 5,
            status: 'REPORTED',
            location_address: 'Indiranagar 100ft Road',
            created_at: new Date().toISOString()
          }
        ],
        pagination: { total: 1, page: 1, limit: 10, pages: 1 }
      });

      renderWithAuth(<EmergenciesPage />);

      expect(screen.getByText('Emergency Incident Intake & Triage Queue')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('INC-20260930-1001')).toBeInTheDocument();
        expect(screen.getByText('Indiranagar 100ft Road')).toBeInTheDocument();
      });
    });
  });

  describe('ServiceZonesPage', () => {
    it('renders service zones and GIS integration notices', async () => {
      mockZoneService.getZones.mockResolvedValue({
        zones: [
          {
            id: 1,
            zone_code: 'BLR-CENTRAL',
            name: 'Central Bengaluru Zone',
            description: 'CBD, MG Road, Shivaji Nagar coverage sector',
            is_active: true,
            centroid_lat: 12.9716,
            centroid_lng: 77.5946,
            coverage_radius_km: 8.5
          }
        ],
        pagination: { total: 1, page: 1, limit: 12, pages: 1 }
      });

      renderWithAuth(<ServiceZonesPage />);

      expect(screen.getByText('Dispatch Service Zones & Coverage Sectors')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.getByText('Central Bengaluru Zone')).toBeInTheDocument();
        expect(screen.getByText('BLR-CENTRAL')).toBeInTheDocument();
      });
    });
  });
});
