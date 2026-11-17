import type { NextConfig } from 'next';

const config: NextConfig = {
  // PGlite (local dev database) ships WASM and must not be bundled.
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default config;
