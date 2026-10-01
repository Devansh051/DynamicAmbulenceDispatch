import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import RoleRoute from './components/RoleRoute';

import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import PendingApprovalPage from './pages/PendingApprovalPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import ProfilePage from './pages/ProfilePage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminApprovalsPage from './pages/AdminApprovalsPage';
import DashboardPage from './pages/DashboardPage';
import EmergenciesPage from './pages/EmergenciesPage';
import AmbulancesPage from './pages/AmbulancesPage';
import HospitalsPage from './pages/HospitalsPage';
import ServiceZonesPage from './pages/ServiceZonesPage';
import SettingsPage from './pages/SettingsPage';
import NotFoundPage from './pages/NotFoundPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pending-approval" element={<PendingApprovalPage />} />
          <Route path="/change-password" element={<ChangePasswordPage />} />

          {/* Protected Application Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            {/* Dashboard available to all authenticated roles */}
            <Route index element={<DashboardPage />} />

            {/* Profile & Security available to all authenticated roles */}
            <Route path="profile" element={<ProfilePage />} />

            {/* Role-specific operations */}
            <Route
              path="emergencies"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'DISPATCHER']}>
                  <EmergenciesPage />
                </RoleRoute>
              }
            />

            <Route
              path="ambulances"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'DISPATCHER', 'AMBULANCE_CREW']}>
                  <AmbulancesPage />
                </RoleRoute>
              }
            />

            <Route
              path="hospitals"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'DISPATCHER', 'HOSPITAL_OPERATOR']}>
                  <HospitalsPage />
                </RoleRoute>
              }
            />

            <Route
              path="zones"
              element={
                <RoleRoute allowedRoles={['ADMIN', 'DISPATCHER']}>
                  <ServiceZonesPage />
                </RoleRoute>
              }
            />

            {/* Administrator Management */}
            <Route
              path="admin/users"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <AdminUsersPage />
                </RoleRoute>
              }
            />

            <Route
              path="admin/approvals"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <AdminApprovalsPage />
                </RoleRoute>
              }
            />

            <Route
              path="settings"
              element={
                <RoleRoute allowedRoles={['ADMIN']}>
                  <SettingsPage />
                </RoleRoute>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
