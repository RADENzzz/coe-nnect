/**
 * Local-only message type for the chat UI prototype.
 * Once the backend lands, this will be replaced by a server model.
 */
export interface LocalMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

/**
 * A chat participant. For the prototype, this is derived from
 * the online presence list — you can only chat with someone online.
 */
export interface ChatParticipant {
  user_id: string;
  username: string;
  role: string;
  dept_id: number | null;
  dept_code: string | null;
  dept_name: string | null;
  isOnline: boolean;
}