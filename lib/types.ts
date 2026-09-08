export type User = {
  id: string;
  name: string;
  bio: string;
  avatar: string | null;
  color: string;
  created_at?: string;
};
export type Post = {
  id: string;
  body: string;
  created_at: string;
  author: User;
  likes: number;
  comments: number;
  liked: boolean;
};
export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author: User;
};
export type Chat = {
  id: string;
  title: string | null;
  is_group: boolean;
  participants: User[];
  last_body: string | null;
  updated_at: string;
};
export type Message = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  author: User;
};
