import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
} from 'typeorm';
import { ConversationMember } from './conversation-member.entity';

@Entity('conversation')
export class Conversation {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'conversation_id' })
  conversationId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => ConversationMember, (m) => m.conversation)
  members: ConversationMember[];
}