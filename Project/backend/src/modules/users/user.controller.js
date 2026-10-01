import userService from './user.service.js';
import { AuthError } from '../auth/auth.service.js';
import { formatSuccess, formatError } from '../../utils/responseFormatter.js';

export const listUsers = async (req, res, next) => {
  try {
    const { page, limit, search, role, status } = req.query;
    const result = await userService.listUsers({ page, limit, search, role, status });
    return res.status(200).json(formatSuccess(result.users, { pagination: result.pagination }));
  } catch (error) {
    next(error);
  }
};

export const getUser = async (req, res, next) => {
  try {
    const user = await userService.getUserById(req.params.id);
    return res.status(200).json(formatSuccess(user));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const provisionUser = async (req, res, next) => {
  try {
    const { email, name, role, temporaryPassword } = req.body;
    const result = await userService.provisionUser({
      email,
      name,
      role,
      temporaryPassword,
      adminId: req.user.id,
      req
    });

    return res.status(201).json(formatSuccess(result, { message: 'User provisioned successfully' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { name, role, status } = req.body;
    const updated = await userService.updateUser(req.params.id, { name, role, status }, req.user.id, req);
    return res.status(200).json(formatSuccess(updated, { message: 'User updated successfully' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const updateStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const updated = await userService.updateUserStatus(req.params.id, status, req.user.id, req);
    return res.status(200).json(formatSuccess(updated, { message: `User status changed to ${status}` }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const updateRole = async (req, res, next) => {
  try {
    const { role } = req.body;
    const updated = await userService.updateUserRole(req.params.id, role, req.user.id, req);
    return res.status(200).json(formatSuccess(updated, { message: `User role changed to ${role}` }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const approveUser = async (req, res, next) => {
  try {
    const approved = await userService.approveUser(req.params.id, req.user.id, req);
    return res.status(200).json(formatSuccess(approved, { message: 'User account approved and activated' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export const rejectUser = async (req, res, next) => {
  try {
    const rejected = await userService.rejectUser(req.params.id, req.user.id, req);
    return res.status(200).json(formatSuccess(rejected, { message: 'User account registration rejected' }));
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json(formatError(error.message, error.code));
    }
    next(error);
  }
};

export default {
  listUsers,
  getUser,
  provisionUser,
  updateUser,
  updateStatus,
  updateRole,
  approveUser,
  rejectUser
};
