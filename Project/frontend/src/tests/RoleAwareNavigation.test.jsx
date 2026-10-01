import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import MainLayout from '../layouts/MainLayout';
import AuthContext from '../context/AuthContext';

describe('Role-Aware Navigation (MainLayout)', () => {
  const renderLayoutWithRole = (role, name = 'Test Operator') => {
    const authValues = {
      user: { id: 1, name, email: 'operator@ems.local', role, status: 'ACTIVE' },
      role,
      isAuthenticated: true,
      isLoading: false,
      logout: () => {}
    };

    return render(
      <AuthContext.Provider value={authValues}>
        <BrowserRouter>
          <MainLayout />
        </BrowserRouter>
      </AuthContext.Provider>
    );
  };

  it('renders administrator navigation links when authenticated as ADMIN', () => {
    renderLayoutWithRole('ADMIN', 'Chief Admin');

    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Account Approvals')).toBeInTheDocument();
    expect(screen.getByText('Service Zones')).toBeInTheDocument();
    expect(screen.getByText('Fleet Ambulances')).toBeInTheDocument();
    expect(screen.getByText('Hospital Network')).toBeInTheDocument();
    expect(screen.getByText('Emergencies')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Profile & Security')).toBeInTheDocument();
  });

  it('does NOT render administrator links when authenticated as DISPATCHER', () => {
    renderLayoutWithRole('DISPATCHER', 'Dispatcher Dan');

    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Account Approvals')).not.toBeInTheDocument();
    expect(screen.getByText('Dispatcher Command')).toBeInTheDocument();
    expect(screen.getByText('Emergencies')).toBeInTheDocument();
    expect(screen.getByText('Ambulances')).toBeInTheDocument();
    expect(screen.getByText('Hospitals')).toBeInTheDocument();
    expect(screen.getByText('Service Zones')).toBeInTheDocument();
  });

  it('renders only crew links when authenticated as AMBULANCE_CREW', () => {
    renderLayoutWithRole('AMBULANCE_CREW', 'Medic Mike');

    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Account Approvals')).not.toBeInTheDocument();
    expect(screen.queryByText('Emergencies')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Zones')).not.toBeInTheDocument();
    expect(screen.getByText('Crew Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Fleet Operations')).toBeInTheDocument();
  });

  it('renders hospital operator links when authenticated as HOSPITAL_OPERATOR', () => {
    renderLayoutWithRole('HOSPITAL_OPERATOR', 'Nurse Nancy');

    expect(screen.queryByText('User Management')).not.toBeInTheDocument();
    expect(screen.queryByText('Account Approvals')).not.toBeInTheDocument();
    expect(screen.queryByText('Service Zones')).not.toBeInTheDocument();
    expect(screen.getByText('Hospital Operations')).toBeInTheDocument();
    expect(screen.getByText('Hospital Network')).toBeInTheDocument();
  });
});
