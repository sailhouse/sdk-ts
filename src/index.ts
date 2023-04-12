import { Wretch, default as w } from "wretch";
import { default as addon, QueryStringAddon } from "wretch/addons/queryString";

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

export class SailhouseClient {
  private apiKey: string;
  private api: QueryStringAddon & Wretch<QueryStringAddon>;

  constructor(apiKey: string, opts?: Partial<Options>) {
    this.apiKey = apiKey;
    this.api = w()
      .polyfills({ fetch: opts?.fetch ?? fetch })
      .addon(addon)
      .auth(apiKey)
      .url("https://api.sailhouse.dev");
  }

  queryEvents = async <T extends unknown>(
    topic: string,
    subscription: string,
    query: string,
    options: GetEventOptions<T> = {},
  ): Promise<EventsResponse<T>> => {
    const results = await this.api
      .url(`/topics/${topic}/subscriptions/${subscription}/events`)
      .query({
        ...options,
        query,
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

  sendEvent = async <T extends unknown>(
    topic: string,
    event: T,
  ): Promise<void> => {
    await this.api.url(`/topics/${topic}/events`).post({ data: event }).res();
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
