import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import ProtectedRoute from '../components/ProtectedRoute';
import AuthContext from '../context/AuthContext';

describe('ProtectedRoute Component', () => {
  const renderProtectedRoute = (authValues, initialEntry = '/protected') => {
    return render(
      <AuthContext.Provider value={authValues}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/login" element={<div>LOGIN_PAGE</div>} />
            <Route path="/pending-approval" element={<div>PENDING_APPROVAL_PAGE</div>} />
            <Route path="/change-password" element={<div>CHANGE_PASSWORD_PAGE</div>} />
            <Route
              path="/protected"
              element={
                <ProtectedRoute>
                  <div>PROTECTED_CONTENT</div>
                </ProtectedRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    );
  };

  it('renders loading spinner when auth state is loading', () => {
    renderProtectedRoute({
      user: null,
      isAuthenticated: false,
      isLoading: true
    });

    expect(screen.getByText(/CONNECTING TO EMS COMMAND CENTER/i)).toBeInTheDocument();
  });

  it('redirects unauthenticated users to /login', () => {
    renderProtectedRoute({
      user: null,
      isAuthenticated: false,
      isLoading: false
    });

    expect(screen.getByText('LOGIN_PAGE')).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED_CONTENT')).not.toBeInTheDocument();
  });

  it('redirects users with PENDING status to /pending-approval', () => {
    renderProtectedRoute({
      user: { id: 1, email: 'pending@ems.local', status: 'PENDING' },
      isAuthenticated: false,
      isPending: true,
      isLoading: false
    });

    expect(screen.getByText('PENDING_APPROVAL_PAGE')).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED_CONTENT')).not.toBeInTheDocument();
  });

  it('redirects users requiring password change to /change-password', () => {
    renderProtectedRoute({
      user: { id: 1, email: 'temp@ems.local', status: 'ACTIVE', must_change_password: true },
      isAuthenticated: true,
      mustChangePassword: true,
      isLoading: false
    });

    expect(screen.getByText('CHANGE_PASSWORD_PAGE')).toBeInTheDocument();
    expect(screen.queryByText('PROTECTED_CONTENT')).not.toBeInTheDocument();
  });

  it('renders protected child content for active authenticated users', () => {
    renderProtectedRoute({
      user: { id: 1, email: 'active@ems.local', status: 'ACTIVE', role: 'DISPATCHER' },
      isAuthenticated: true,
      isLoading: false
    });

    expect(screen.getByText('PROTECTED_CONTENT')).toBeInTheDocument();
  });
});
