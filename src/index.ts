import { Wretch, default as w } from "wretch";
import { default as addon, QueryStringAddon } from "wretch/addons/queryString";
import WebSocket from "ws";

// Nested keyof utility type
type NestedKeyOf<T, U = T> = U extends object
  ? {
      [K in keyof U]-?: K extends string
        ? `${K}` | `${K}.${NestedKeyOf<T, U[K]>}`
        : never;
    }[keyof U]
  : never;

type TimeWindow = `${number}${"s" | "m" | "h"}`;

interface GetEventOptions<T> {
  time_window?: TimeWindow;
  queryable_path?: NestedKeyOf<T>;
}

export interface IEvent<T> {
  id: string;
  data: T;
  queryableValue: string;
  timestamp: string;
  ack: () => Promise<void>;
}

interface InternalEventsResponse<T> {
  events: IEvent<T>[];
  offset: number;
  limit: number;
}

export interface EventsResponse<T> {
  events: Event<T>[];
  offset: number;
  limit: number;
}

type PublishEventResponse = {
  id: string;
};

class Event<T> implements IEvent<T> {
  id: string;
  data: T;
  queryableValue: string;
  timestamp: string;
  client: SailhouseClient;
  topic: string;
  subscription: string;

  constructor(
    event: IEvent<T>,
    topic: string,
    subscription: string,
    client: SailhouseClient,
  ) {
    this.id = event.id;
    this.data = event.data;
    this.queryableValue = event.queryableValue;
    this.timestamp = event.timestamp;
    this.client = client;
    this.topic = topic;
    this.subscription = subscription;
  }

  ack = async (): Promise<void> => {
    return await this.client.ackEvent(this.topic, this.subscription, this.id);
  };
}

interface Options {
  fetch: typeof fetch;
}

type PublishEventOptions = {
  metadata?: Record<string, string>;
  send_at?: Date;
};

export class SailhouseClient {
  private api: QueryStringAddon & Wretch<QueryStringAddon>;
  private apiKey: string;

  constructor(apiKey: string, opts?: Partial<Options>) {
    this.api = w()
      .polyfills({ fetch: opts?.fetch ?? fetch })
      .addon(addon)
      .auth(apiKey)
      .headers({
        "x-source": "sailhouse-js",
      })
      .url("https://api.sailhouse.dev");

    this.apiKey = apiKey;
  }

  getEvents = async <T extends unknown>(
    topic: string,
    subscription: string,
    options: GetEventOptions<T> = {},
  ): Promise<EventsResponse<T>> => {
    const results = await this.api
      .url(`/topics/${topic}/subscriptions/${subscription}/events`)
      .query({
        ...options,
      })
      .get()
      .json<InternalEventsResponse<T>>();

    return {
      events: results.events.map(
        (event) => new Event(event, topic, subscription, this),
      ),
      limit: results.limit,
      offset: results.offset,
    };
  };

  streamEvents<T extends unknown>(
    topic: string,
    subscription: string,
    handler: (event: Event<T>) => void | Promise<void>,
    options: GetEventOptions<T> = {},
  ): () => void {
    const randomClientId = Math.random().toString(36).substring(7);

    const ws = new WebSocket("wss://api.sailhouse.dev/events/stream");

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          topic_slug: topic,
          subscription_slug: subscription,
          token: this.apiKey,
          client_id: randomClientId,
        }),
      );
    });

    ws.on("message", async (data) => {
      const json = JSON.parse(data.toString());

      const event = new Event<T>(json, topic, subscription, this);

      await handler(event);
    });

    ws.on("close", () => {});

    ws.on("error", (err) => {
      throw new Error(err.message);
    });

    return () => {
      ws.close();
    };
  }

  publish = async <T extends unknown>(
    topic: string,
    event: T,
    options?: PublishEventOptions,
  ): Promise<PublishEventResponse> => {
    let sendAt = undefined;
    if (options?.send_at) {
      sendAt = options.send_at.toISOString();
    }

    return await this.api
      .url(`/topics/${topic}/events`)
      .post({ data: event, metadata: options?.metadata, send_at: sendAt })
      .json<PublishEventResponse>();
  };

  ackEvent = async (
    topic: string,
    subscription: string,
    eventId: string,
  ): Promise<void> => {
    await this.api
      .url(`/topics/${topic}/subscriptions/${subscription}/events/${eventId}`)
      .post()
      .res();
  };
}
