export type Message = {
  workspaceId: string;
  channelId: string;
  userId: number;
  body: string;
  memberId: number;
  attachments: string[];
  key?: string;
  conversationId?:string
};
