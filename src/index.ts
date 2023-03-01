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
  apiKey: string;
  fetch: typeof fetch;

  constructor(apiKey: string, opts?: Partial<Options>) {
    this.apiKey = apiKey;
    this.fetch = opts?.fetch ?? fetch;
  }

  queryEvents = async <T extends unknown>(
    topic: string,
    subscription: string,
    query: string,
    options: GetEventOptions<T> = {},
  ): Promise<IEvent<T>[]> => {
    const path = `https://api.sailhouse.dev/topics/${topic}/subscriptions/${subscription}/events`;
    const url = new URL(path);

    Object.entries({ ...options, query }).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const results = await this.fetch(url.toString(), {
      headers: {
        Authorization: this.apiKey,
      },
    }).then((res) => res.json() as Promise<IEvent<T>[]>);
    return results.map((event) => new Event(event, topic, subscription, this));
  };

  getEvents = async <T extends unknown>(
    topic: string,
    subscription: string,
    options: GetEventOptions<T> = {},
  ): Promise<EventsResponse<T>> => {
    const path = `https://api.sailhouse.dev/topics/${topic}/subscriptions/${subscription}/events`;
    const url = new URL(path);

    Object.entries(options).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });

    const results = await this.fetch(url.toString(), {
      headers: {
        Authorization: this.apiKey,
      },
    }).then((res) => res.json() as Promise<InternalEventsResponse<T>>);

    return {
      ...results,
      events: results.events.map(
        (event) => new Event(event, topic, subscription, this),
      ),
    };
  };

  sendEvent = async <T extends unknown>(
    topic: string,
    event: T,
  ): Promise<void> => {
    const path = `https://api.sailhouse.dev/topics/${topic}/events`;

    return await this.fetch(path, {
      method: "POST",
      body: JSON.stringify({ data: event }),
      headers: {
        "Content-Type": "application/json",
        Authorization: this.apiKey,
      },
    }).then(() => {});
  };

  ackEvent = async (
    topic: string,
    subscription: string,
    eventId: string,
  ): Promise<void> => {
    const path = `https://api.sailhouse.dev/topics/${topic}/subscriptions/${subscription}/events/${eventId}`;

    return await this.fetch(path, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
      },
    }).then(() => {});
  };
}
