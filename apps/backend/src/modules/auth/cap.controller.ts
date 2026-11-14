import { Body, Controller, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CapRedeemBody, CapService } from './cap.service';

/**
 * Public Cap Core endpoints used by the login widget. They intentionally do
 * not require a bearer token: the visitor is not signed in yet.
 *
 * The widget posts to `<endpoint>challenge` and `<endpoint>redeem`, which is
 * why the route prefix is `/v1/auth/cap/` on the frontend.
 */
@ApiTags('Auth')
@Public()
@Controller('v1/auth/cap')
export class CapController {
  constructor(private readonly cap: CapService) {}

  @ApiSecurity({})
  @Post('challenge')
  challenge() {
    return this.cap.createChallenge();
  }

  @ApiSecurity({})
  @Post('redeem')
  redeem(@Body() body: CapRedeemBody) {
    return this.cap.redeem(body);
  }
}
