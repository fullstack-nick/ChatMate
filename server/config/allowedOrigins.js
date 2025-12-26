const defaultOrigins = ["http://localhost:5174", "http://localhost:5173"];

const envOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : [];

const envSuffixes = process.env.ALLOWED_ORIGIN_SUFFIXES
  ? process.env.ALLOWED_ORIGIN_SUFFIXES.split(",").map((suffix) => suffix.trim()).filter(Boolean)
  : [];

const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  return envSuffixes.some((suffix) => origin.endsWith(suffix));
};

module.exports = { allowedOrigins, isAllowedOrigin };
