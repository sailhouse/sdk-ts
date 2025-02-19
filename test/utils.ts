import { rest } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, beforeEach } from "vitest";

export const EventRequests: any[] = [];

const server = setupServer(
  rest.get(
    "https://api.sailhouse.dev/topics/:topic/subscriptions/:subscription/events",
    (req, res, ctx) => {
      return res(
        ctx.json({
          events: [
            {
              id: "1",
              data: {
                foo: "bar",
              },
              created_at: "2021-01-01T00:00:00Z",
            },
          ],
          limit: 1,
          offset: 0,
        }),
      );
    },
  ),
  rest.post(
    "https://api.sailhouse.dev/topics/:topic/subscriptions/:subscription/events/:event",
    async (req, res, ctx) => {
      if (
        req.params.event !== "1" ||
        req.params.topic !== "topic" ||
        req.params.subscription !== "subscription"
      ) {
        return res(ctx.status(404));
      }

      return res(ctx.json({}));
    },
  ),
  rest.post(
    "https://api.sailhouse.dev/topics/:topic/events",
    async (req, res, ctx) => {
      if (req.params.topic !== "topic") {
        return res(ctx.status(404));
      }

      const body = await req.json();
      EventRequests.push(body);

      return res(ctx.json({}));
    },
  ),
  rest.get(
    "https://api.sailhouse.dev/topics/:topic/subscriptions/:subscription/events/pull",
    async (req, res, ctx) => {
      if (req.params.subscription === "empty") {
        return res(ctx.status(204));
      }

      return res(
        ctx.json({
          id: "1",
          data: {
            foo: "bar",
          },
          created_at: "2021-01-01T00:00:00Z",
        }),
      );
    },
  ),
);

beforeEach(() => {
  EventRequests.length = 0;
});

beforeAll(() => {
  // Establish requests interception layer before all tests.
  server.listen();
});
afterAll(() => {
  // Clean up after all tests are done, preventing this
  // interception layer from affecting irrelevant tests.
  server.close();
});
