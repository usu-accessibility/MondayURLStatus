import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import * as fastq from "fastq";
import type { queueAsPromised } from "fastq";

import { TWebhookBody } from "./types.js";
import { getAllItems } from "./actions.js";
import { worker } from "./worker.js";

const app = new Hono().basePath("/api");

const q: queueAsPromised<TWebhookBody["event"]> = fastq.promise(worker, 3);

q.error((error, event) => {
  if (error) {
    console.error(`Error processing event with data:`, event, error);
  }
});

app.get("/", (c) => {
  return c.json(
    {
      error: false,
      message: "Server running...",
    },
    200
  );
});

app.use(async (c, next) => {
  try {
    const body = await c.req.json();

    if (body.hasOwnProperty("challenge")) {
      return c.json(body);
    }

    await next();
  } catch (e) {
    console.error(e);
    return c.json(
      {
        error: true,
        message: "Something went wrong.",
      },
      500
    );
  }
});

app.post("/check-url", async (c) => {
  const body = await c.req.json<TWebhookBody>();

  q.push(body.event);

  return c.json(
    {
      error: false,
      message: "Successfully added.",
    },
    200
  );
});

app.post("/check-all-urls", async (c) => {
  const body = await c.req.json<TWebhookBody>();

  const items = await getAllItems(body.event.boardId, body.event.groupId);

  for (const item of items) {
    q.push({
      boardId: body.event.boardId,
      pulseId: parseInt(item.id),
      groupId: body.event.groupId,
      columnId: body.event.columnId,
    });
  }

  return c.json(
    {
      error: false,
      message: "Successfully added.",
    },
    200
  );
});

const port = process.env.PORT || "3000";
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: parseInt(port),
});
