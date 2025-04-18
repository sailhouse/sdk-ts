import { AdminRequests } from "../test/utils.js";
import { SailhouseClient } from "./index.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("Sailhouse Admin Client", () => {
  let client: SailhouseClient;
  
  beforeEach(() => {
    client = new SailhouseClient("key");
  });

  it("should register a push subscription", async () => {
    const result = await client.admin.registerPushSubscription(
      "topic", 
      "subscription", 
      "https://example.com/webhook"
    );

    expect(result.outcome).toBe("created");
    expect(AdminRequests).toHaveLength(1);
    expect(AdminRequests[0].topic).toBe("topic");
    expect(AdminRequests[0].subscription).toBe("subscription");
    expect(AdminRequests[0].type).toBe("push");
    expect(AdminRequests[0].endpoint).toBe("https://example.com/webhook");
    expect(AdminRequests[0].filter).toBeUndefined();
  });

  it("should register a push subscription with filter", async () => {
    const result = await client.admin.registerPushSubscription(
      "topic", 
      "subscription", 
      "https://example.com/webhook",
      {
        filter: {
          path: "data.type",
          value: "test"
        }
      }
    );

    expect(result.outcome).toBe("created");
    expect(AdminRequests).toHaveLength(1);
    expect(AdminRequests[0].topic).toBe("topic");
    expect(AdminRequests[0].subscription).toBe("subscription");
    expect(AdminRequests[0].type).toBe("push");
    expect(AdminRequests[0].endpoint).toBe("https://example.com/webhook");
    expect(AdminRequests[0].filter).toEqual({
      path: "data.type",
      value: "test"
    });
  });
});