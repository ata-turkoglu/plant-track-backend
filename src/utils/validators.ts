import { ApiError } from './apiError';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateEmail = (email: string): void => {
  if (!emailRegex.test(email)) {
    throw new ApiError(400, 'Invalid email format');
  }
};

export const validateStrongPassword = (password: string): void => {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (!(hasMinLength && hasUppercase && hasLowercase && hasNumber && hasSpecial)) {
    throw new ApiError(
      400,
      'Password must be at least 8 chars and include upper, lower, number, and special char'
    );
  }
};

export const validateName = (value: string, field: string): void => {
  if (!value || value.trim().length < 2 || value.trim().length > 100) {
    throw new ApiError(400, `${field} must be between 2 and 100 characters`);
  }
};

export const requirePositiveQuantity = (value: unknown, field = 'quantity'): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive number`);
  }
  return parsed;
};

export const requirePositiveId = (value: unknown, field: string): number => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }
  return parsed;
};
