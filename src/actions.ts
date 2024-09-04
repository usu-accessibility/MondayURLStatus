import fetch from "node-fetch";
import https from "https";

import { monday } from "./monday-client";
import { TWebhookBody } from "./types";

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

  if (!response.data && response.data.length === 0) {
    return undefined;
  }

  return response.data.items[0].column_values[0].text as string;
};

const getUrlStatus = async (url: string) => {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      agent: (urlToCheck) => {
        if (urlToCheck.protocol === "https")
          return new https.Agent({
            rejectUnauthorized: false,
          });
      },
    });

    return {
      status: response.status,
      newUrl: response.headers.get("location") ?? "",
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
  } else if (data.status > 500 && data.status < 9999) {
    values = JSON.stringify(
      JSON.stringify({
        [columnId]: "ServiceUnavailable",
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

  await monday.api(`
    mutation {
      change_multiple_column_values(item_id:${itemId}, board_id: ${boardId}, column_values: ${values}) {
        id
      }
    }
  `);
};
