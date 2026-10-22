import {
  buildHelmetOptions,
  isBasicAuthHeaderValid,
  isCorsOriginAllowed,
  isSwaggerEnabled,
} from '../src/config/security.config';

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe('security configuration', () => {
  describe('CORS', () => {
    it('allows only explicit origins in production', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu',
      });

      expect(isCorsOriginAllowed('https://coe.example.edu', config)).toBe(true);
      expect(isCorsOriginAllowed('https://evil.example.edu', config)).toBe(
        false,
      );
    });

    it('does not trust localhost or Vercel previews in production', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu',
      });

      expect(isCorsOriginAllowed('http://localhost:5173', config)).toBe(false);
      expect(isCorsOriginAllowed('https://preview.vercel.app', config)).toBe(
        false,
      );
    });

    it('supports an additional explicit allowlist', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu',
        CORS_ALLOWED_ORIGINS: 'https://admin.example.edu',
      });

      expect(isCorsOriginAllowed('https://admin.example.edu', config)).toBe(
        true,
      );
    });

    it('normalizes trailing slashes and rejects malformed origins', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu/',
      });

      expect(isCorsOriginAllowed('https://coe.example.edu', config)).toBe(true);
      expect(isCorsOriginAllowed('not-a-url', config)).toBe(false);
    });

    it('keeps loopback convenience in development', () => {
      const config = env({ NODE_ENV: 'development' });
      expect(isCorsOriginAllowed('http://127.0.0.1:5174', config)).toBe(true);
      expect(isCorsOriginAllowed('https://evil.example.edu', config)).toBe(
        false,
      );
    });

    it('supports subdomain wildcards in configured origins', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://*.trycloudflare.com',
      });

      expect(
        isCorsOriginAllowed(
          'https://calm-river-1234.trycloudflare.com',
          config,
        ),
      ).toBe(true);
      expect(isCorsOriginAllowed('https://trycloudflare.com', config)).toBe(
        false,
      );
      expect(
        isCorsOriginAllowed('https://trycloudflare.com.evil.test', config),
      ).toBe(false);
      expect(
        isCorsOriginAllowed('http://calm-river-1234.trycloudflare.com', config),
      ).toBe(false);
      expect(isCorsOriginAllowed('https://evil.example.edu', config)).toBe(
        false,
      );
    });

    it('ignores unsupported wildcard shapes', () => {
      const config = env({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://*.*.example.com,https://*.',
      });

      expect(isCorsOriginAllowed('https://a.example.com', config)).toBe(false);
      expect(isCorsOriginAllowed('https://example.com', config)).toBe(false);
    });

    it('allows rotating quick-tunnel hosts when CORS_ALLOW_TUNNEL is set', () => {
      const config = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu',
        CORS_ALLOW_TUNNEL: 'true',
      });

      expect(
        isCorsOriginAllowed(
          'https://quiet-hill-9876.trycloudflare.com',
          config,
        ),
      ).toBe(true);
      expect(isCorsOriginAllowed('https://evil.example.edu', config)).toBe(
        false,
      );

      const disabled = env({
        NODE_ENV: 'production',
        FRONTEND_URL: 'https://coe.example.edu',
      });
      expect(
        isCorsOriginAllowed(
          'https://quiet-hill-9876.trycloudflare.com',
          disabled,
        ),
      ).toBe(false);
    });

    it('accepts quick-tunnel hosts outside production without extra flags', () => {
      const config = env({
        NODE_ENV: 'development',
        FRONTEND_URL: 'http://localhost:5173',
      });

      expect(
        isCorsOriginAllowed(
          'https://quiet-hill-9876.trycloudflare.com',
          config,
        ),
      ).toBe(true);
      expect(isCorsOriginAllowed('https://evil.example.edu', config)).toBe(
        false,
      );
    });
  });

  describe('Swagger', () => {
    it('is open outside production', () => {
      expect(isSwaggerEnabled(env({ NODE_ENV: 'test' }))).toBe(true);
    });

    it('is disabled in production unless enabled with credentials', () => {
      expect(isSwaggerEnabled(env({ NODE_ENV: 'production' }))).toBe(false);
      expect(
        isSwaggerEnabled(
          env({ NODE_ENV: 'production', ENABLE_SWAGGER: 'true' }),
        ),
      ).toBe(false);
      expect(
        isSwaggerEnabled(
          env({
            NODE_ENV: 'production',
            ENABLE_SWAGGER: 'true',
            SWAGGER_USER: 'ops',
            SWAGGER_PASSWORD: 'secret',
          }),
        ),
      ).toBe(true);
    });

    it('validates basic auth headers', () => {
      const header = `Basic ${Buffer.from('ops:secret').toString('base64')}`;
      expect(isBasicAuthHeaderValid(header, 'ops', 'secret')).toBe(true);
      expect(isBasicAuthHeaderValid(header, 'ops', 'wrong')).toBe(false);
      expect(isBasicAuthHeaderValid(undefined, 'ops', 'secret')).toBe(false);
      expect(
        isBasicAuthHeaderValid(
          `Bearer ${Buffer.from('ops:secret').toString('base64')}`,
          'ops',
          'secret',
        ),
      ).toBe(false);
    });
  });

  describe('CSP', () => {
    it('allows inline Swagger assets only when docs are enabled', () => {
      const production = buildHelmetOptions(
        env({
          NODE_ENV: 'production',
          ENABLE_SWAGGER: 'false',
        }),
      ) as any;
      const dev = buildHelmetOptions(env({ NODE_ENV: 'test' })) as any;

      expect(production.contentSecurityPolicy.directives.scriptSrc).toEqual([
        "'self'",
      ]);
      expect(dev.contentSecurityPolicy.directives.scriptSrc).toContain(
        "'unsafe-inline'",
      );
    });
  });
});
