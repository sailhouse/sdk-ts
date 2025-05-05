import { Wretch } from "wretch";
import { QueryStringAddon } from "wretch/addons/queryString";

type RegisterResult = {
  outcome: "created" | "updated" | "none";
};

type FilterCondition = {
  path: string;
  condition: string;
  value: string;
};

type ComplexFilter = {
  filters: FilterCondition[];
  operator: string;
};

type Filter = boolean | null | ComplexFilter;

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
      filter?: Filter;
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
