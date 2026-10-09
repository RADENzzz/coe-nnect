import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { User } from '../../users/entities/user.entity';

@Entity('message')
export class Message {
  @PrimaryGeneratedColumn({ type: 'bigint', name: 'message_id' })
  messageId: string;

  @Column({ type: 'bigint', name: 'conversation_id' })
  conversationId: string;

  @Column({ type: 'uuid', name: 'sender_id' })
  senderId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: Conversation;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender: User;
}