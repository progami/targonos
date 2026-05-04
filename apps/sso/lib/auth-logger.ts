const red = '\x1b[31m'
const reset = '\x1b[0m'

type AuthLoggerError = Error & {
  cause?: Record<string, unknown> & {
    err?: Error
  }
  type?: string
}

function getAuthErrorName(error: Error): string {
  const authLoggerError = error as AuthLoggerError
  if (typeof authLoggerError.type === 'string' && authLoggerError.type !== '') {
    return authLoggerError.type
  }

  return error.name
}

export function shouldSuppressAuthError(error: AuthLoggerError): boolean {
  if (error.type !== 'JWTSessionError') {
    return false
  }

  if (!error.cause) {
    return false
  }

  const causeError = error.cause.err
  if (!(causeError instanceof Error)) {
    return false
  }

  if (causeError.message.includes('no matching decryption secret')) {
    return true
  }

  return causeError.message.includes('decryption operation failed')
}

export function logAuthError(error: Error, logger: Pick<Console, 'error'> = console): void {
  const authLoggerError = error as AuthLoggerError
  if (shouldSuppressAuthError(authLoggerError)) {
    return
  }

  const name = getAuthErrorName(error)
  logger.error(`${red}[auth][error]${reset} ${name}: ${error.message}`)

  if (
    authLoggerError.cause &&
    typeof authLoggerError.cause === 'object' &&
    'err' in authLoggerError.cause &&
    authLoggerError.cause.err instanceof Error
  ) {
    const { err, ...data } = authLoggerError.cause
    logger.error(`${red}[auth][cause]${reset}:`, err.stack)
    logger.error(`${red}[auth][details]${reset}:`, JSON.stringify(data, null, 2))
    return
  }

  if (typeof error.stack === 'string' && error.stack !== '') {
    logger.error(error.stack.replace(/.*/, '').substring(1))
  }
}

export const authLogger = {
  error: logAuthError,
}
