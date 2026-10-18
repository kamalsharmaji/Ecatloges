import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ApiError } from '@/api/client'

/**
 * Copy backend field errors onto react-hook-form fields.
 * Returns the message to show at form level (non-field errors or unknown fields), if any.
 */
export function applyApiErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
  fieldMap: Record<string, string> = {},
): string | null {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  if (error.code !== 'validation_error' || !error.details) return error.message

  let formLevel: string | null = null
  for (const [key, value] of Object.entries(error.details)) {
    const message = Array.isArray(value) ? String(value[0]) : String(value)
    const field = fieldMap[key] ?? key
    if (fields.includes(field)) setError(field as Path<T>, { type: 'server', message })
    else formLevel ??= message
  }
  return formLevel
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.'
}
