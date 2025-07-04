import { AdminClient } from "./admin.js";
import {
  PushSubscriptionVerifier,
  VerificationOptions,
} from "./push-subscriptions.js";
import { Wretch, default as w } from "wretch";
import { default as addon, QueryStringAddon } from "wretch/addons/queryString";

// Export push subscription types and functions
export {
  PushSubscriptionVerifier,
  PushSubscriptionVerificationError,
  verifyPushSubscriptionSignature,
  verifyPushSubscriptionSignatureSafe,
  type SignatureComponents,
  type PushSubscriptionHeaders,
  type PushSubscriptionPayload,
  type VerificationOptions,
} from "./push-subscriptions.js";

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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
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
    this.metadata = event.metadata;
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

  /**
   * Verify a push subscription signature
   * @param signature The Sailhouse-Signature header value
   * @param body The raw request body as string
   * @param secret The push subscription secret
   * @param options Verification options
   * @returns true if signature is valid
   * @throws PushSubscriptionVerificationError if verification fails
   */
  verifyPushSubscription = (
    signature: string,
    body: string,
    secret: string,
    options?: VerificationOptions,
  ): boolean => {
    const verifier = new PushSubscriptionVerifier(secret);
    return verifier.verifySignature(signature, body, options);
  };

  /**
   * Create a push subscription verifier instance
   * @param secret The push subscription secret
   * @returns PushSubscriptionVerifier instance
   */
  createPushSubscriptionVerifier = (
    secret: string,
  ): PushSubscriptionVerifier => {
    return new PushSubscriptionVerifier(secret);
  };

  subscriber = (opts?: SubscriberOptions): SailhouseSubscriber => {
    return new SailhouseSubscriber(this, opts);
  };
}

type Subscriber = {
  topic: string;
  subscription: string;
  handler: SubscriptionHandler<unknown>;
};

type SubscriptionHandler<TData> = (args: {
  event: Event<TData>;
}) => Promise<void>;

type SubscriberOptions = {
  perSubscriptionProcessors?: number;
};

class SailhouseSubscriber {
  private _client: SailhouseClient;
  private _subscribers: Subscriber[] = [];
  private _running: boolean = false;
  private _activeLoops: Promise<void>[] = [];

  private _perSubscriptionProcessors = 1;

  constructor(client: SailhouseClient, opts?: SubscriberOptions) {
    this._client = client;

    if (opts) {
      this._perSubscriptionProcessors = opts.perSubscriptionProcessors ?? 1;
    }
  }

  public subscribe = <TData = unknown>(
    topic: string,
    subscription: string,
    handler: SubscriptionHandler<TData>,
  ) => {
    this._subscribers.push({
      topic,
      subscription,
      handler: handler as SubscriptionHandler<unknown>,
    });
  };

  public start = async () => {
    if (this._running) {
      throw new Error("Subscriber is already running");
    }

    this._running = true;

    this._activeLoops = this._subscribers.flatMap((subscriber) =>
      new Array(this._perSubscriptionProcessors)
        .fill(0)
        .map(() => this._runSubscriberLoop(subscriber)),
    );

    await Promise.all(this._activeLoops);
  };

  public stop = () => {
    this._running = false;
  };

  private _runSubscriberLoop = async (
    subscriber: Subscriber,
  ): Promise<void> => {
    const { topic, subscription, handler } = subscriber;

    while (this._running) {
      try {
        // Pull an event from the subscription
        const event = await this._client.pull(topic, subscription);

        if (event) {
          try {
            // Handle the event
            await handler({ event });

            await event.ack();
          } catch (handlerError) {
            console.error(
              `Error handling event ${event.id} from ${topic}/${subscription}:`,
              handlerError,
            );
          }
        } else {
          await this._delay(1000); // 100ms delay
        }
      } catch (pullError) {
        console.error(
          `Error pulling from ${topic}/${subscription}:`,
          pullError,
        );
        await this._delay(1000);
      }
    }
  };

  private _delay = (ms: number): Promise<void> => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  };
}
