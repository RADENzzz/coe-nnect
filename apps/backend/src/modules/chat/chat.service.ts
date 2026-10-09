import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { SupabaseService } from '../../database/supabase.service';
import { Conversation } from './entities/conversation.entity';
import { ConversationMember } from './entities/conversation-member.entity';
import { Message } from './entities/message.entity';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { User } from '../users/entities/user.entity';

/** Roles allowed to participate in chat. Viewers are excluded (CH-1.9). */
const CHAT_ELIGIBLE_ROLES = [
  'administrator',
  'college_dean',
  'department_head',
] as const;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(Conversation)
    private readonly conversations: Repository<Conversation>,
    @InjectRepository(ConversationMember)
    private readonly members: Repository<ConversationMember>,
    @InjectRepository(Message)
    private readonly messages: Repository<Message>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly supabase: SupabaseService,
  ) {}

  // ────────────────────────────────────────────
  // Authorization
  // ────────────────────────────────────────────

  private ensureEligible(profile: User) {
    if (!profile) throw new ForbiddenException('Not authenticated');
    if (!CHAT_ELIGIBLE_ROLES.includes(profile.role as any)) {
      throw new ForbiddenException(
        'Your role is not allowed to use chat.',
      );
    }
  }

  private async ensureMember(
    conversationId: string,
    userId: string,
  ): Promise<ConversationMember> {
    const member = await this.members.findOne({
      where: { conversationId, userId },
    });
    if (!member) {
      throw new ForbiddenException(
        'You are not a member of this conversation.',
      );
    }
    return member;
  }

  // ────────────────────────────────────────────
  // List / read
  // ────────────────────────────────────────────

  /**
   * List my conversations with: other participant, last message, unread count.
   */
  async listConversations(userId: string) {
    const myMemberships = await this.members.find({ where: { userId } });
    if (myMemberships.length === 0) return [];

    const convIds = myMemberships.map((m) => m.conversationId);

    // Fetch all members of those conversations so we know the "other" user
    const allMembers = await this.members.find({
      where: { conversationId: In(convIds) },
    });
    const otherUserIds = Array.from(
      new Set(
        allMembers
          .filter((m) => m.userId !== userId)
          .map((m) => m.userId),
      ),
    );

    const usersById = new Map<string, User>();
    if (otherUserIds.length > 0) {
      const users = await this.users.find({
        where: { userId: In(otherUserIds) },
      });
      for (const u of users) usersById.set(u.userId, u);
    }

    // Fetch last message per conversation (one query, then reduce)
    const allMessages = await this.messages.find({
      where: { conversationId: In(convIds) },
      order: { createdAt: 'DESC' },
    });

    const lastByConv = new Map<string, Message>();
    for (const m of allMessages) {
      if (!lastByConv.has(m.conversationId)) {
        lastByConv.set(m.conversationId, m);
      }
    }

    // Fetch unread counts per conversation
    const myMembershipByConv = new Map(
      myMemberships.map((m) => [m.conversationId, m]),
    );

    const unreadByConv = new Map<string, number>();
    for (const m of allMessages) {
      const myMembership = myMembershipByConv.get(m.conversationId);
      if (!myMembership) continue;
      if (m.senderId === userId) continue;
      const lastReadAt = myMembership.lastReadAt?.getTime() ?? 0;
      if (new Date(m.createdAt).getTime() > lastReadAt) {
        unreadByConv.set(
          m.conversationId,
          (unreadByConv.get(m.conversationId) ?? 0) + 1,
        );
      }
    }

    return myMemberships.map((my) => {
      const otherMember = allMembers.find(
        (m) =>
          m.conversationId === my.conversationId && m.userId !== userId,
      );
      const otherUser = otherMember
        ? usersById.get(otherMember.userId)
        : null;
      const last = lastByConv.get(my.conversationId);

      return {
        conversationId: my.conversationId,
        otherUser: otherUser
          ? {
              userId: otherUser.userId,
              username: otherUser.username,
              role: otherUser.role,
              deptId: otherUser.deptId,
            }
          : null,
        lastMessage: last
          ? {
              messageId: last.messageId,
              senderId: last.senderId,
              body: last.body,
              createdAt: last.createdAt,
            }
          : null,
        unreadCount: unreadByConv.get(my.conversationId) ?? 0,
        lastReadAt: my.lastReadAt,
      };
    });
  }

  async listMessages(
    conversationId: string,
    userId: string,
    before?: string,
    limit = 50,
  ) {
    await this.ensureMember(conversationId, userId);

    const qb = this.messages
      .createQueryBuilder('m')
      .where('m.conversation_id = :conversationId', { conversationId })
      .orderBy('m.message_id', 'DESC')
      .take(Math.min(limit, 100));

    if (before) {
      qb.andWhere('m.message_id < :before', { before });
    }

    const rows = await qb.getMany();
    // Return in ascending order for the UI
    return rows.reverse().map((m) => ({
      messageId: m.messageId,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: m.body,
      createdAt: m.createdAt,
    }));
  }

  // ────────────────────────────────────────────
  // Writes
  // ────────────────────────────────────────────

  /**
   * Create a direct conversation between me and otherUserId.
   * Idempotent — returns the existing conversation if one already exists.
   */
  async createConversation(dto: CreateConversationDto, profile: User) {
    this.ensureEligible(profile);

    if (dto.otherUserId === profile.userId) {
      throw new BadRequestException(
        'You cannot start a conversation with yourself.',
      );
    }

    const otherUser = await this.users.findOne({
      where: { userId: dto.otherUserId },
    });
    if (!otherUser) throw new NotFoundException('User not found');
    if (!otherUser.isActive) {
      throw new BadRequestException('User is inactive.');
    }
    if (!CHAT_ELIGIBLE_ROLES.includes(otherUser.role as any)) {
      throw new BadRequestException(
        'This user is not eligible for chat.',
      );
    }

    // Look for an existing direct conversation between the two users.
    // We find all conversations I'm in, then intersect with conversations
    // otherUserId is in, then check for exactly 2 members.
    const myMemberships = await this.members.find({
      where: { userId: profile.userId },
    });
    const myConvIds = myMemberships.map((m) => m.conversationId);

    if (myConvIds.length > 0) {
      const shared = await this.members.find({
        where: {
          conversationId: In(myConvIds),
          userId: dto.otherUserId,
        },
      });
      if (shared.length > 0) {
        const convId = shared[0].conversationId;
        const memberCount = await this.members.count({
          where: { conversationId: convId },
        });
        if (memberCount === 2) {
          return { conversationId: convId, created: false };
        }
      }
    }

    // Create new
    const conv = this.conversations.create({});
    const savedConv = await this.conversations.save(conv);

    const m1 = this.members.create({
      conversationId: savedConv.conversationId,
      userId: profile.userId,
    });
    const m2 = this.members.create({
      conversationId: savedConv.conversationId,
      userId: dto.otherUserId,
    });
    await this.members.save([m1, m2]);

    this.logger.log(
      `Created conversation ${savedConv.conversationId} between ${profile.userId} and ${dto.otherUserId}`,
    );

    return {
      conversationId: savedConv.conversationId,
      created: true,
    };
  }

  async sendMessage(
    conversationId: string,
    dto: SendMessageDto,
    profile: User,
  ) {
    this.ensureEligible(profile);
    await this.ensureMember(conversationId, profile.userId);

    const body = dto.body.trim();
    if (body.length === 0) {
      throw new BadRequestException('Message body cannot be empty.');
    }

    const msg = this.messages.create({
      conversationId,
      senderId: profile.userId,
      body,
    });
    const saved = await this.messages.save(msg);

    // Auto-mark my own message as read (I just sent it)
    await this.members.update(
      { conversationId, userId: profile.userId },
      { lastReadAt: new Date() },
    );

    return {
      messageId: saved.messageId,
      conversationId: saved.conversationId,
      senderId: saved.senderId,
      body: saved.body,
      createdAt: saved.createdAt,
    };
  }

  async markRead(conversationId: string, profile: User) {
    this.ensureEligible(profile);
    await this.ensureMember(conversationId, profile.userId);

    await this.members.update(
      { conversationId, userId: profile.userId },
      { lastReadAt: new Date() },
    );

    return { success: true };
  }

  /**
   * List users I'm allowed to chat with.
   * Returns eligible leadership users (Admin, Dean, DHs) excluding myself.
   */
  async listEligibleUsers(profile: User) {
    this.ensureEligible(profile);

    const users = await this.users.find({
      where: { isActive: true, role: In(CHAT_ELIGIBLE_ROLES as any) },
      order: { username: 'ASC' },
    });

    return users
      .filter((u) => u.userId !== profile.userId)
      .map((u) => ({
        userId: u.userId,
        username: u.username,
        role: u.role,
        deptId: u.deptId,
      }));
  }
}