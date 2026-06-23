/**
 * Typowane, pogrupowane odczytanie konfiguracji ze zmiennych środowiskowych.
 * Walidacja odbywa się w env.validation.ts; tutaj tylko mapujemy na strukturę.
 */
export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  mongoUri: process.env.MONGO_URI ?? '',
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '1d',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID ?? '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? '',
    callbackUrl: process.env.GITHUB_CALLBACK_URL ?? '',
  },
  slack: {
    clientId: process.env.SLACK_CLIENT_ID ?? '',
    clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
    callbackUrl: process.env.SLACK_CALLBACK_URL ?? '',
  },
  // Bazowy URL frontendu — do budowania linków w mailach (np. reset hasła).
  appUrl: process.env.APP_URL ?? 'http://localhost:3001',
  // Swagger /api/docs — domyślnie tylko poza produkcją; w prod włącz świadomie.
  swaggerEnabled: process.env.SWAGGER_ENABLED ?? 'false',
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    inviteTokenTtlHours: parseInt(
      process.env.INVITE_TOKEN_TTL_HOURS ?? '72',
      10,
    ),
    passwordResetTtlHours: parseInt(
      process.env.PASSWORD_RESET_TTL_HOURS ?? '1',
      10,
    ),
  },
  // SMTP — gdy `host` jest pusty, maile są tylko logowane (świadoma luka).
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'DocuGraph <no-reply@docugraph.local>',
  },
  corsOrigins: process.env.CORS_ORIGINS ?? '*',
  throttle: {
    ttl: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
  workspaceRoot: process.env.WORKSPACE_ROOT ?? './workspaces',
});
