import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { TWebhookBody } from "./types";
import { getData, handleUpdate } from "./actions";

const app = new Hono().basePath("/api");

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
  try {
    const body = await c.req.json<TWebhookBody>();

    const { boardId, columnId, pulseId, data } = await getData(body);

    await handleUpdate(boardId, pulseId, columnId, data);

    return c.json(
      {
        error: false,
        message: "Successfully ran.",
      },
      200
    );
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

const port = process.env.PORT || "3000";
console.log(`Server is running on port ${port}`);

serve({
  fetch: app.fetch,
  port: parseInt(port),
});
