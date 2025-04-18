import { Wretch } from "wretch";
import { QueryStringAddon } from "wretch/addons/queryString";

type RegisterResult = {
  outcome: "created" | "updated" | "none";
};

export class AdminClient {
  private api: QueryStringAddon & Wretch<QueryStringAddon>;

  constructor(api: QueryStringAddon & Wretch<QueryStringAddon>) {
    this.api = api;
  }

  registerPushSubscription = async (
    topic: string,
    subscription: string,
    endpoint: string,
    options?: {
      filter?: {
        path: string;
        value: string;
      };
    },
  ): Promise<RegisterResult> => {
    const result = await this.api
      .url(`/api/v1/topics/${topic}/subscriptions/${subscription}`)
      .put({
        type: "push",
        endpoint,
        filter: options?.filter,
      })
      .json<RegisterResult>();

    return result;
  };
}
