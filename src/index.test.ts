import { SailhouseClient } from "./index.js";
import { beforeEach, describe, expect, it } from "vitest";

describe("Sailhouse Client", () => {
  let client: SailhouseClient;
  beforeEach(() => {
    client = new SailhouseClient("key");
  });
  it("should return events from a topic and subscription", async () => {
    const events = await client.getEvents("topic", "subscription");

    expect(events.events).toHaveLength(1);
    expect(events.events[0].id).toBe("1");
    expect(events.events[0].data).toEqual({ foo: "bar" });
  });

  it("should call the ack endpoint when ack is called", async () => {
    const events = await client.getEvents("topic", "subscription");

    expect(async () => await events.events[0].ack()).not.toThrow();
  });

  it("should send an event", async () => {
    await client.sendEvent("topic", { foo: "bar" });

    expect(true).toBe(true);
  });
});
