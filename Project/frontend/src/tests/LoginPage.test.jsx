import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '../pages/LoginPage';
import AuthContext from '../context/AuthContext';

describe('LoginPage Component', () => {
  const mockLogin = vi.fn();
  const mockLoginWithGoogle = vi.fn();

  const renderWithContext = (authValues = {}) => {
    const defaultAuth = {
      user: null,
      isAuthenticated: false,
      login: mockLogin,
      loginWithGoogle: mockLoginWithGoogle,
      authError: null,
      ...authValues
    };

    return render(
      <AuthContext.Provider value={defaultAuth}>
        <BrowserRouter>
          <LoginPage />
        </BrowserRouter>
      </AuthContext.Provider>
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders login form elements and branding properly', () => {
    renderWithContext();

    expect(screen.getByText(/EMS DISPATCH/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/operator@ems-dispatch.local/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/••••••••••••/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sign In to Command Center/i })).toBeInTheDocument();
  });

  it('shows error validation when submitting empty fields', async () => {
    renderWithContext();

    const submitBtn = screen.getByRole('button', { name: /Sign In to Command Center/i });
    fireEvent.click(submitBtn);

    // HTML5 required or state validation
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits credentials to login handler on valid input', async () => {
    mockLogin.mockResolvedValueOnce({ user: { email: 'admin@ems.local', must_change_password: false } });

    renderWithContext();

    const emailInput = screen.getByPlaceholderText(/operator@ems-dispatch.local/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••••••/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Command Center/i });

    fireEvent.change(emailInput, { target: { value: 'dispatcher@ems.local' } });
    fireEvent.change(passwordInput, { target: { value: 'SecretPassword123!' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('dispatcher@ems.local', 'SecretPassword123!');
    });
  });

  it('displays error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));

    renderWithContext();

    const emailInput = screen.getByPlaceholderText(/operator@ems-dispatch.local/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••••••/i);
    const submitBtn = screen.getByRole('button', { name: /Sign In to Command Center/i });

    fireEvent.change(emailInput, { target: { value: 'dispatcher@ems.local' } });
    fireEvent.change(passwordInput, { target: { value: 'WrongPassword' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Invalid email or password/i)).toBeInTheDocument();
    });
  });
});
