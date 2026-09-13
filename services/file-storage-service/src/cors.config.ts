type Environment = Record<string, string | undefined>;

const CORS_METHODS = ['GET', 'PUT', 'OPTIONS'];
const CORS_ALLOWED_HEADERS = ['Content-Type'];

function parseOrigins(value: string | undefined) {
  return (value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => Boolean(origin) && origin !== '*');
}

export function getFileStorageCorsOptions(env: Environment = process.env) {
  const origins = parseOrigins(
    env.FILE_STORAGE_ALLOWED_ORIGINS || env.FRONTEND_URLS,
  );

  return {
    origin:
      origins.length > 0
        ? origins
        : env.NODE_ENV === 'production'
          ? false
          : true,
    methods: CORS_METHODS,
    allowedHeaders: CORS_ALLOWED_HEADERS,
    credentials: false,
    optionsSuccessStatus: 204,
  };
}
