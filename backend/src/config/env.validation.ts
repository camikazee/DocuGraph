import * as Joi from 'joi';

/**
 * Schemat walidacji zmiennych środowiskowych.
 * Aplikacja nie wstanie, jeśli któraś wymagana zmienna jest nieprawidłowa.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().default(3000),

  MONGO_URI: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('1d'),

  // GitHub OAuth — wymagane dopiero w Fazie 3; na razie opcjonalne z domyślnymi.
  GITHUB_CLIENT_ID: Joi.string().allow('').default(''),
  GITHUB_CLIENT_SECRET: Joi.string().allow('').default(''),
  GITHUB_CALLBACK_URL: Joi.string().allow('').default(''),

  // Slack OAuth — opcjonalne (logowanie Slackiem działa po uzupełnieniu).
  SLACK_CLIENT_ID: Joi.string().allow('').default(''),
  SLACK_CLIENT_SECRET: Joi.string().allow('').default(''),
  SLACK_CALLBACK_URL: Joi.string().allow('').default(''),

  BCRYPT_ROUNDS: Joi.number().default(12),
  INVITE_TOKEN_TTL_HOURS: Joi.number().default(72),
  PASSWORD_RESET_TTL_HOURS: Joi.number().default(1),

  // Bazowy URL frontendu (linki w mailach) + SMTP. SMTP_HOST puste = log-only.
  APP_URL: Joi.string().allow('').default('http://localhost:3001'),
  SWAGGER_ENABLED: Joi.string().valid('true', 'false').default('false'),
  SMTP_HOST: Joi.string().allow('').default(''),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().allow('').default(''),
  SMTP_PASS: Joi.string().allow('').default(''),
  SMTP_FROM: Joi.string()
    .allow('')
    .default('DocuGraph <no-reply@docugraph.local>'),

  // CORS — lista dozwolonych origin po przecinku, lub '*' dla wszystkich.
  CORS_ORIGINS: Joi.string().default('*'),

  // Rate limiting (globalny): okno w ms i limit żądań na IP w tym oknie.
  THROTTLE_TTL_MS: Joi.number().default(60000),
  THROTTLE_LIMIT: Joi.number().default(100),

  // Ostrzejszy limit dla endpointów auth (login/register/forgot/reset).
  AUTH_THROTTLE_TTL_MS: Joi.number().default(60000),
  AUTH_THROTTLE_LIMIT: Joi.number().default(10),

  // Katalog bazowy na pliki .md (filesystem = źródło prawdy).
  WORKSPACE_ROOT: Joi.string().default('./workspaces'),
});
