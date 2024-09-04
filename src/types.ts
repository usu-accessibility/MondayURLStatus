export type TWebhookBody = {
  event: {
    boardId: number;
    pulseId: number;
    columnId: string;
  };
};
