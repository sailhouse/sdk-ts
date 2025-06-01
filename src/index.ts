import { AdminClient } from "./admin.js";
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
  api_url?: string;
}

type PublishEventOptions = {
  metadata?: Record<string, string>;
  send_at?: Date;
  wait_group_instance_id?: string;
};

type WaitOptions = {
  ttl?: TimeWindow;
};

export class SailhouseClient {
  private api: QueryStringAddon & Wretch<QueryStringAddon>;
  private apiKey: string;
  public admin: AdminClient;

  constructor(apiKey: string, opts?: Partial<Options>) {
    this.api = w()
      .polyfills({ fetch: opts?.fetch ?? fetch })
      .addon(addon)
      .auth(apiKey)
      .headers({
        "x-source": "sailhouse-js",
      })
      .url(opts?.api_url ?? "https://api.sailhouse.dev");

    this.apiKey = apiKey;
    this.admin = new AdminClient(this.api);
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
      .post({
        data: event,
        metadata: options?.metadata,
        send_at: sendAt,
        wait_group_instance_id: options?.wait_group_instance_id,
      })
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

  pull = async <T extends unknown>(
    topic: string,
    subscription: string,
  ): Promise<Event<T> | null> => {
    const res = await this.api
      .url(`/topics/${topic}/subscriptions/${subscription}/events/pull`)
      .get()
      .res();

    if (res.status === 204) {
      return null;
    }

    const event = (await res.json()) as IEvent<T>;
    return new Event(event, topic, subscription, this);
  };

  wait = async (
    topic: string,
    events: ({ topic: string; body: unknown } & Omit<
      PublishEventOptions,
      "wait_group_instance_id"
    >)[],
    options?: WaitOptions,
  ): Promise<void> => {
    const { wait_group_instance_id } = await this.api
      .url(`/waitgroups/instances`)
      .post({
        topic,
        ttl: options?.ttl,
      })
      .json<{ wait_group_instance_id: string }>();

    await Promise.all(
      events.map((event) =>
        this.publish(event.topic, event.body, {
          ...event,
          wait_group_instance_id,
        }),
      ),
    );

    // This is a close to no-op, but it will mark the wait group as in progress
    // so it can be processed correctly
    await this.api
      .url(`/waitgroups/instances/${wait_group_instance_id}/events`)
      .put({})
      .res();
  };
}
