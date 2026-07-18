// Ustawia ostry limit auth PRZED importem AppModule (dekorator @Throttle na
// endpointach auth czyta env w czasie importu). Musi być importowany jako
// pierwszy w spec-u testującym throttling auth, przed `./setup-env`.
process.env.AUTH_THROTTLE_LIMIT = '3';
process.env.AUTH_THROTTLE_TTL_MS = '60000';
