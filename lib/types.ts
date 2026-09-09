export type Reaction = { emoji: string; count: number; mine: boolean };
export type User = {
  plus_active?: boolean;
  plus_until?: string;
  name_color?: string | null;
  is_private?: boolean;
  can_view?: boolean;
  blocked?: boolean;
  verified?: boolean;
  can_manage_verification?: boolean;
  id: string;
  name: string;
  bio: string;
  avatar: string | null;
  color: string;
  created_at?: string;
};
export type Post = {
  reactions?: Reaction[];
  attachments?: import("@/components/media").Attachment[];
  id: string;
  body: string;
  created_at: string;
  author: User;
  likes: number;
  comments: number;
  liked: boolean;
};
export type Comment = {
  attachments?: import("@/components/media").Attachment[];
  id: string;
  body: string;
  created_at: string;
  author: User;
};
export type Chat = {
  created_by: string;
  id: string;
  title: string | null;
  is_group: boolean;
  participants: User[];
  last_body: string | null;
  updated_at: string;
};
export type Message = {
  reactions?: Reaction[];
  envelope?: import("./crypto-chat").Envelope | null;
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: User;
};
