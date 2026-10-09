import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';

@Entity('conversation_member')
export class ConversationMember {
  @PrimaryColumn({ type: 'bigint', name: 'conversation_id' })
  conversationId: string;

  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId: string;

  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date;

  @ManyToOne(() => Conversation, (c) => c.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}