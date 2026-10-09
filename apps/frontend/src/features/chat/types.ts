export interface LocalMessage {
  id: string;
  senderId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

export interface ChatParticipant {
  user_id: string;
  username: string;
  role: string;
  dept_id: number | null;
  dept_code: string | null;
  dept_name: string | null;
  isOnline: boolean;
}