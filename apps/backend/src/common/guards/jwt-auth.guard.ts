import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../../database/supabase.service';
import { SystemStatusService } from '../../modules/system-status/system-status.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private supabase: SupabaseService,
    private systemStatus: SystemStatusService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    //Skip OPTIONS preflight — let CORS middleware handle it
    if (req.method === 'OPTIONS') {
      return true;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice(7);
    const { data, error } = await this.supabase.getClient().auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    await this.assertNotUnderMaintenance(data.user.id);

    req.user = data.user;
    return true;
  }

  /**
   * Maintenance mode blocks every non-developer API call, including users
   * who were already signed in when the developer enabled it. The hidden
   * `administrator` account keeps full access so it can turn the gate off.
   */
  private async assertNotUnderMaintenance(userId: string): Promise<void> {
    const notice = await this.systemStatus.getMaintenanceNotice();
    if (!notice.active) return;

    const { data: profile } = await this.supabase
      .getAdminClient()
      .from('users')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (profile?.role === 'administrator') return;

    throw new ServiceUnavailableException({
      code: 'MAINTENANCE_MODE',
      message:
        notice.message?.trim() ||
        notice.title?.trim() ||
        'CoE-NNECT is under maintenance. Please try again later.',
      title: notice.title ?? 'Under maintenance',
    });
  }
}
