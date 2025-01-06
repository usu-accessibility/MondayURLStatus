import axios from "axios";
import https from "https";

import { monday } from "./monday-client.js";
import { TWebhookBody } from "./types.js";

const getItemUrl = async (itemId: number) => {
  const response = await monday.api(`
      {
        items(ids: [${itemId}]) {
          column_values(ids: ["text4"]) {
            text
          }
        }
      }
    `);

  if (!response.data || response.data.length === 0) {
    return undefined;
  }

  return response.data.items[0].column_values[0].text as string;
};

const getUrlStatus = async (url: string) => {
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/88.0.4324.182 Safari/537.36",
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      maxRedirects: 0,
      validateStatus: (status) => status < 500,
    });

    return {
      status: response.status,
      newUrl: (response.headers["location"] as string) ?? "",
    };
  } catch (e) {
    console.error(e);
    return {
      status: 9999,
      newUrl: "",
    };
  }
};

export const getData = async (body: TWebhookBody) => {
  const boardId = body.event.boardId;
  const pulseId = body.event.pulseId;
  const columnId = body.event.columnId;
  const url = await getItemUrl(pulseId);

  let data = {
    status: 404,
    newUrl: "",
  };

  if (url) {
    data = await getUrlStatus(url);
  }

  return { boardId, pulseId, columnId, data };
};

export const handleUpdate = async (
  boardId: number,
  itemId: number,
  columnId: string,
  data: {
    status: number;
    newUrl: string;
  }
) => {
  let values: string;
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  if (data.status < 300) {
    values = JSON.stringify(
      JSON.stringify({ [columnId]: "Ok", text488: `Not Changed - ${date}` })
    );
  } else if (data.status < 400) {
    values = JSON.stringify(
      JSON.stringify({
        [columnId]: "MovedPermanently",
        text488: data.newUrl,
      })
    );
  } else if (data.status > 500 && data.status < 9000) {
    values = JSON.stringify(
      JSON.stringify({
        [columnId]: "ServiceUnavailable",
        text488: data.newUrl,
      })
    );
  } else if (data.status === 9001) {
    values = JSON.stringify(
      JSON.stringify({
        [columnId]: "CertificateHasExpired",
        text488: data.newUrl,
      })
    );
  } else if (data.status === 9999) {
    values = JSON.stringify(
      JSON.stringify({
        [columnId]: "Error",
        text488: data.newUrl,
      })
    );
  } else {
    values = JSON.stringify(
      JSON.stringify({ [columnId]: "NotFound", text488: data.newUrl })
    );
  }

  const response = await monday.api(`
    mutation {
      change_multiple_column_values(item_id:${itemId}, board_id: ${boardId}, column_values: ${values}) {
        id
      }
    }
  `);

  if ((response as any)?.status_code === 429) {
    await new Promise((r) => setTimeout(r, 10000));
    return void handleUpdate(boardId, itemId, columnId, data);
  }
};

export const getAllItems = async (boardId: number, groupId: string) => {
  let cursor: null | string = null;
  const items: { id: string; url?: string }[] = [];

  while (true) {
    const response = await monday.api(`
      {
        boards(ids: [${boardId}]) {
          groups(ids: ["${groupId}"]) {
            items_page(limit: 500${cursor ? `, cursor: "${cursor}"` : ""}) {
              cursor
              items {
                id
                column_values (ids: ["text4"]) {
                  text
                }
              }
            }
          }
        }
      }
    `);

    const data = response.data.boards[0].groups[0].items_page as {
      cursor: null | string;
      items: {
        id: string;
        column_values: { text: string }[];
      }[];
    };

    items.push(
      ...data.items.map((item) => ({
        id: item.id,
        url: item.column_values[0].text ?? undefined,
      }))
    );

    if (!data.cursor) {
      break;
    } else {
      cursor = data.cursor;
    }
  }

  return items;
};

export const checkAndUpdateItem = async (
  body: TWebhookBody,
  item: Awaited<ReturnType<typeof getAllItems>>[0]
) => {
  let data = {
    status: 404,
    newUrl: "",
  };

  if (item.url) {
    data = await getUrlStatus(item.url);
  }

  await handleUpdate(
    body.event.boardId,
    parseInt(item.id),
    body.event.columnId,
    data
  );
};
