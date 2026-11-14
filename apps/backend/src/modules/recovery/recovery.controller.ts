import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Auditable } from '../../common/decorators/auditable.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetRecoveryEmailDto } from './dto/set-recovery-email.dto';
import { VerifyRecoveryEmailDto } from './dto/verify-recovery-email.dto';
import { RecoveryService } from './recovery.service';

@ApiTags('Auth')
@ApiBearerAuth('supabase-jwt')
@Controller('v1/recovery')
export class RecoveryController {
  constructor(private readonly service: RecoveryService) {}

  /** Signed-in user: current recovery-email status. */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getSettings(@Req() req: any) {
    return this.service.getSettings(req.user.id);
  }

  /** Add or change the optional recovery address. Sends a verification link. */
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'user.recovery_email_updated', source: 'Recovery' })
  @Put('me')
  setRecoveryEmail(@Req() req: any, @Body() dto: SetRecoveryEmailDto) {
    return this.service.setRecoveryEmail(req.user.id, dto.recoveryEmail);
  }

  /** Remove the recovery address and clear any outstanding tokens. */
  @UseGuards(JwtAuthGuard)
  @Auditable({ action: 'user.recovery_email_removed', source: 'Recovery' })
  @Delete('me')
  removeRecoveryEmail(@Req() req: any) {
    return this.service.setRecoveryEmail(req.user.id, null);
  }

  /** Public: consume the verification link sent to the new address. */
  @Public()
  @ApiSecurity({})
  @Post('verify')
  @HttpCode(200)
  verifyRecoveryEmail(@Body() dto: VerifyRecoveryEmailDto) {
    return this.service.verifyRecoveryEmail(dto.token);
  }

  /**
   * Public: request a reset link for a login email or a verified recovery
   * email. Always answers generically to avoid account enumeration.
   */
  @Public()
  @ApiSecurity({})
  @Post('request')
  @HttpCode(200)
  requestPasswordReset(@Body() dto: RequestPasswordResetDto) {
    return this.service.requestPasswordReset(dto.email);
  }

  /** Public: consume a single-use reset token and set the new password. */
  @Public()
  @ApiSecurity({})
  @Post('reset')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto.token, dto.newPassword);
  }
}
