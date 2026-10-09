import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';
import { Message } from './entities/message.entity';
import { User } from '../users/entities/user.entity';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Conversation,
      ConversationMember,
      Message,
      User,
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService, RolesGuard],
  exports: [ChatService],
})
export class ChatModule {}