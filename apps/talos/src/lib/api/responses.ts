import { NextResponse } from 'next/server'
import { apiLogger } from '@/lib/logger'
import { ZodError } from 'zod'

/**
 * Standardized API response utilities
 */
export class ApiResponses {
  /**
   * Success responses
   */
  static success<T>(data: T, status: number = 200): NextResponse<T> {
    return NextResponse.json(data, { status })
  }

  static created<T>(data: T): NextResponse<T> {
    return NextResponse.json(data, { status: 201 })
  }

  static noContent(): NextResponse {
    return new NextResponse(null, { status: 204 })
  }

  /**
   * Error responses
   */
  static badRequest(message: string = 'Bad Request'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 400 })
  }

  static unauthorized(message: string = 'Unauthorized'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 401 })
  }

  static forbidden(message: string = 'Forbidden'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 403 })
  }

  static notFound(message: string = 'Not Found'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 404 })
  }

  static conflict(message: string = 'Conflict'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 409 })
  }

  static unprocessableEntity(
    message: string = 'Unprocessable Entity'
  ): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 422 })
  }

  static tooManyRequests(message: string = 'Too Many Requests'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 429 })
  }

  static serverError(message: string = 'Internal Server Error'): NextResponse<{ error: string }> {
    return NextResponse.json({ error: message }, { status: 500 })
  }

  /**
   * Handle errors consistently
   */
  static handleError(
    error: unknown
  ): NextResponse<{ error: string } | { error: string; details: Record<string, string> }> {
    if (error instanceof ZodError) {
      const firstIssue = error.issues[0]
      return this.badRequest(firstIssue?.message ?? 'Validation failed')
    }

    if (error && typeof error === 'object') {
      const candidate = error as { name?: unknown; details?: unknown }
      if (
        candidate.name === 'StageGateError' &&
        candidate.details &&
        typeof candidate.details === 'object' &&
        !Array.isArray(candidate.details)
      ) {
        return this.validationError(candidate.details as Record<string, string | string[]>)
      }
    }

    if (error instanceof ValidationError) {
      return this.badRequest(error.message)
    }

    if (error instanceof AuthorizationError) {
      return this.forbidden(error.message)
    }

    if (error instanceof NotFoundError) {
      return this.notFound(error.message)
    }

    if (error instanceof ConflictError) {
      return this.conflict(error.message)
    }

    apiLogger.error('Unhandled API error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return this.serverError('An unexpected error occurred')
  }

  /**
   * Validation error response with field details
   */
  static validationError(
    errors: Record<string, string | string[]>
  ): NextResponse<{ error: string; details: Record<string, string> }> {
    const normalizedErrors: Record<string, string> = {}
    for (const [key, value] of Object.entries(errors)) {
      if (Array.isArray(value)) {
        normalizedErrors[key] = value.join(', ')
        continue
      }
      if (typeof value === 'string') {
        normalizedErrors[key] = value
        continue
      }
      normalizedErrors[key] = 'Invalid value'
    }

    return NextResponse.json(
      {
        error: 'Validation failed',
        details: normalizedErrors,
      },
      { status: 400 }
    )
  }
}

/**
 * Custom error classes for better error handling
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

export class AuthorizationError extends Error {
  constructor(message: string = 'Insufficient permissions') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export class NotFoundError extends Error {
  constructor(message: string = 'Resource not found') {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  constructor(message: string = 'Resource conflict') {
    super(message)
    this.name = 'ConflictError'
  }
}
