import { getData, handleUpdate } from "./actions";
import type { TWebhookBody } from "./types";

export const worker = async (event: TWebhookBody["event"]) => {
  const { boardId, columnId, pulseId, data } = await getData(event);

  await handleUpdate(boardId, pulseId, columnId, data);
};
