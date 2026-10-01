import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AuthContext from '../context/AuthContext';
import EmergenciesPage from '../pages/EmergenciesPage';
import * as emergencyServiceModule from '../services/emergencyService';

const { mockEmergencyService } = vi.hoisted(() => {
  return {
    mockEmergencyService: {
      getEmergencies: vi.fn(),
      getEmergency: vi.fn(),
      createEmergency: vi.fn(),
      updateEmergency: vi.fn(),
      updateStatus: vi.fn(),
      getRecommendations: vi.fn(),
      recalculateRecommendations: vi.fn(),
      getEligibleAmbulances: vi.fn(),
      assignAmbulance: vi.fn(),
      reassignAmbulance: vi.fn(),
      escalateEmergency: vi.fn(),
      getHistory: vi.fn(),
      getHospitals: vi.fn(),
      updateLifecycleStatus: vi.fn(),
      getActiveAssignments: vi.fn(),
      getDispatchConfig: vi.fn()
    }
  };
});

vi.mock('../services/emergencyService', () => ({
  default: mockEmergencyService,
  emergencyService: mockEmergencyService
}));

const renderWithAuth = (ui, role = 'DISPATCHER') => {
  const authValue = {
    user: { id: 1, name: 'Dispatcher Dave', email: 'dispatch@ems.gov', role },
    role,
    isAuthenticated: true,
    token: 'mock-jwt-token'
  };

  return render(
    <AuthContext.Provider value={authValue}>
      <BrowserRouter>
        {ui}
      </BrowserRouter>
    </AuthContext.Provider>
  );
};

describe('Phase 5 Frontend: Dispatch Recommendation Engine & Approval Workflow', () => {
  const mockEmergency = {
    id: 101,
    incident_code: 'EMG-20260930-5001',
    emergency_type: 'CARDIAC',
    severity: 5,
    status: 'VERIFIED',
    location_address: '100ft Road, Indiranagar, Bengaluru',
    latitude: 12.9784,
    longitude: 77.6408,
    created_at: new Date().toISOString(),
    assigned_ambulance_id: null,
    assigned_hospital_id: null,
    reportedByUser: { id: 1, name: 'Dispatcher Dave', role: 'DISPATCHER' }
  };

  const mockRecommendations = {
    recommendation_id: 'REC-20260930-9999',
    emergency_id: 101,
    generated_at: new Date().toISOString(),
    ttl_seconds: 300,
    top_candidate: {
      ambulance_id: 21,
      fleet_code: 'AMB-BLR-01',
      score: 94.2
    },
    candidates: [
      {
        rank: 1,
        ambulance_id: 21,
        fleet_code: 'AMB-BLR-01',
        ambulance_type: 'ALS',
        score: 94.2,
        travel_time_minutes: 3.8,
        distance_km: 1.9,
        route_calculation_method: 'OSRM_ROUTING_SERVICE',
        coverage_impact: 'LOW',
        remaining_zone_units: 3,
        fuel_percentage: 90,
        freshness_minutes: 0.8
      },
      {
        rank: 2,
        ambulance_id: 22,
        fleet_code: 'AMB-BLR-02',
        ambulance_type: 'BLS',
        score: 82.5,
        travel_time_minutes: 6.2,
        distance_km: 3.4,
        route_calculation_method: 'OSRM_ROUTING_SERVICE',
        coverage_impact: 'MODERATE',
        remaining_zone_units: 1,
        fuel_percentage: 75,
        freshness_minutes: 1.5
      }
    ],
    exclusions: [
      {
        ambulance_id: 23,
        fleet_code: 'AMB-BLR-03',
        reason: "Ambulance status is 'busy' / assigned to another active emergency."
      },
      {
        ambulance_id: 24,
        fleet_code: 'AMB-BLR-04',
        reason: 'Fuel level (12%) is below safe minimum threshold (15%).'
      }
    ]
  };

  const mockHospitals = {
    hospitals: [
      {
        HospitalID: 1,
        HospitalName: 'Victoria Hospital Trauma Center',
        address: 'Fort Road, Bengaluru',
        formatted_duration: '8 mins'
      }
    ]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockEmergencyService.getEmergencies.mockResolvedValue({
      emergencies: [mockEmergency],
      pagination: { total: 1, page: 1, limit: 20, totalPages: 1 }
    });
    mockEmergencyService.getEmergency.mockResolvedValue(mockEmergency);
    mockEmergencyService.getRecommendations.mockResolvedValue(mockRecommendations);
    mockEmergencyService.getHospitals.mockResolvedValue(mockHospitals);
    mockEmergencyService.assignAmbulance.mockResolvedValue({ success: true, message: 'Assigned' });
    mockEmergencyService.recalculateRecommendations.mockResolvedValue(mockRecommendations);
    mockEmergencyService.escalateEmergency.mockResolvedValue({ success: true, message: 'Escalated' });
    mockEmergencyService.getHistory.mockResolvedValue({
      events: [
        {
          id: 1,
          event_type: 'INCIDENT_CREATED',
          actor_role: 'DISPATCHER',
          created_at: new Date().toISOString(),
          notes: 'Emergency 911 intake received'
        }
      ]
    });
  });

  it('renders the Phase 5 emergency queue with multi-factor dispatch button', async () => {
    renderWithAuth(<EmergenciesPage />);

    expect(screen.getByText('Emergency Incident Intake & Triage Queue')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('EMG-20260930-5001')).toBeInTheDocument();
      expect(screen.getByText('LEVEL 5 • RESUSCITATION')).toBeInTheDocument();
      expect(screen.getByText('Dispatch')).toBeInTheDocument();
    });
  });

  it('opens the Dispatch Recommendation modal and displays ranked candidates with multi-factor scoring', async () => {
    renderWithAuth(<EmergenciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Dispatch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dispatch'));

    await waitFor(() => {
      // Modal Title
      expect(screen.getByText(/Ambulance Dispatch Recommendation/i)).toBeInTheDocument();
      // Ranked candidate cards
      expect(screen.getByText('AMB-BLR-01')).toBeInTheDocument();
      expect(screen.getByText('#1 RECOMMENDED')).toBeInTheDocument();
      expect(screen.getByText('94/100')).toBeInTheDocument();
      // Second candidate
      expect(screen.getByText('AMB-BLR-02')).toBeInTheDocument();
      expect(screen.getByText('83/100')).toBeInTheDocument();
    });
  });

  it('toggles exclusions accordion to show disqualified units and clear reasons', async () => {
    renderWithAuth(<EmergenciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Dispatch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dispatch'));

    await waitFor(() => {
      expect(screen.getByText(/Excluded Fleet Units \(2 Disqualified\)/i)).toBeInTheDocument();
    });

    // Toggle open exclusions
    fireEvent.click(screen.getByText(/Excluded Fleet Units/i));

    await waitFor(() => {
      expect(screen.getByText('AMB-BLR-03')).toBeInTheDocument();
      expect(screen.getByText(/Fuel level \(12%\) is below safe minimum threshold/i)).toBeInTheDocument();
    });
  });

  it('shows dispatcher override warning when selecting candidate #2 and requires override reason', async () => {
    renderWithAuth(<EmergenciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Dispatch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dispatch'));

    await waitFor(() => {
      expect(screen.getByText('AMB-BLR-02')).toBeInTheDocument();
    });

    // Select candidate #2 (override)
    const radio2 = screen.getByDisplayValue('22');
    fireEvent.click(radio2);

    await waitFor(() => {
      expect(screen.getByText(/Dispatcher Manual Override Warning/i)).toBeInTheDocument();
      expect(screen.getByPlaceholderText(/Specialized pediatric kit/i)).toBeInTheDocument();
    });

    // Try submitting without override reason
    const submitBtn = screen.getByText('Approve & Confirm Assignment');
    expect(submitBtn).toBeDisabled();

    // Fill in override reason
    const input = screen.getByPlaceholderText(/Specialized pediatric kit/i);
    fireEvent.change(input, { target: { value: 'Crew already mobilized nearby and familiar with locality' } });

    expect(submitBtn).not.toBeDisabled();
  });

  it('confirms assignment with explicit human approval and triggers service call', async () => {
    renderWithAuth(<EmergenciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Dispatch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Dispatch'));

    await waitFor(() => {
      expect(screen.getByText('Approve & Confirm Assignment')).toBeInTheDocument();
    });

    const submitBtn = screen.getByText('Approve & Confirm Assignment');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockEmergencyService.assignAmbulance).toHaveBeenCalledWith(
        101,
        expect.objectContaining({
          ambulance_id: 21,
          recommendation_id: 'REC-20260930-9999'
        })
      );
    });
  });

  it('opens and displays the append-only audit event timeline', async () => {
    renderWithAuth(<EmergenciesPage />);

    await waitFor(() => {
      expect(screen.getByTitle('View Append-Only Audit Timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTitle('View Append-Only Audit Timeline'));

    await waitFor(() => {
      expect(screen.getByText(/Append-Only Event History/i)).toBeInTheDocument();
      expect(screen.getByText('INCIDENT_CREATED')).toBeInTheDocument();
      expect(screen.getByText('Emergency 911 intake received')).toBeInTheDocument();
    });
  });
});
