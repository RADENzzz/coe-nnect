import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ChatService } from './chat.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

/**
 * Chat is restricted to Administrator / College Dean / Department Head.
 * Viewers are excluded entirely (CH-1.9).
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrator', 'college_dean', 'department_head')
@Controller('v1/chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  // ── Static routes first (route-ordering rule) ──

  @Get('users')
  async listEligibleUsers(@Req() req: any) {
    return { data: await this.chat.listEligibleUsers(req.profile) };
  }

  @Get('conversations')
  async listConversations(@Req() req: any) {
    return { data: await this.chat.listConversations(req.profile.userId) };
  }

  // ── Parameterized routes ──

  @Post('conversations')
  async createConversation(
    @Body() dto: CreateConversationDto,
    @Req() req: any,
  ) {
    return {
      data: await this.chat.createConversation(dto, req.profile),
    };
  }

  @Get('conversations/:id/messages')
  async listMessages(
    @Param('id') id: string,
    @Query('before') before: string | undefined,
    @Query('limit') limit: string | undefined,
    @Req() req: any,
  ) {
    return {
      data: await this.chat.listMessages(
        id,
        req.profile.userId,
        before,
        limit ? Number(limit) : 50,
      ),
    };
  }

  @Post('conversations/:id/messages')
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @Req() req: any,
  ) {
    return { data: await this.chat.sendMessage(id, dto, req.profile) };
  }

  @Patch('conversations/:id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    return { data: await this.chat.markRead(id, req.profile) };
  }
}