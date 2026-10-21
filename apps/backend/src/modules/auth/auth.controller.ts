import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SkipDeptActive } from '../../common/decorators/skip-dept-active.decorator';

@ApiTags('Auth')
@ApiBearerAuth('supabase-jwt')
@Controller('v1/auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  /** Public — no bearer token required. */
  @ApiSecurity({})
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /**
   * Returns the current user's profile, including whether their
   * department is active. The frontend calls this to decide whether
   * to render the deactivation wall.
   *
   * `@SkipDeptActive()` is critical here: this route must remain
   * reachable even when the DH's dept is inactive, otherwise the
   * frontend can never learn "you're walled" and would deadlock on
   * a 403 with no context.
   */
  @SkipDeptActive()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: any) {
    return this.auth.getProfile(req.user.id);
  }
}