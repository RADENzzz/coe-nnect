import { SetMetadata } from '@nestjs/common';

/**
 * Marks a controller or route as reachable without a Supabase bearer token.
 *
 * The global JwtAuthGuard protects every HTTP route by default. Public routes
 * must opt out explicitly with this decorator, which keeps newly added
 * controllers secure even if the author forgets `@UseGuards`.
 *
 * A public route can still enforce its own credential (for example the IDP
 * signature/device guards); this only skips the user-JWT check.
 */
export const IS_PUBLIC_KEY = 'isPublic';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
