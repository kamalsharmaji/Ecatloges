import { z } from 'zod'

/** Mirrors the backend's password validators enough to catch obvious problems before submit. */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password is too long.')
  .refine((v) => !/^\d+$/.test(v), 'Password cannot be entirely numeric.')

export const newPasswordSchema = z
  .object({
    new_password: passwordSchema,
    new_password_confirm: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((v) => v.new_password === v.new_password_confirm, {
    path: ['new_password_confirm'],
    message: 'Passwords do not match.',
  })
