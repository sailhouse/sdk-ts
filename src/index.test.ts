import { EventRequests } from "../test/utils.js";
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
    await client.publish("topic", { foo: "bar" });

    expect(EventRequests).toHaveLength(1);
    expect(EventRequests[0].data).toEqual({ foo: "bar" });
  });

  it("should pass the scheduled event time", async () => {
    const date = new Date();
    await client.publish("topic", { foo: "bar" }, { send_at: date });

    expect(EventRequests).toHaveLength(1);
    expect(EventRequests[0].send_at).toBe(date.toISOString());
  });

  it("should pull a subscription event", async () => {
    const event = await client.pull("topic", "subscription");

    expect(event).not.toBeNull();
    expect(event?.id).toBe("1");
    expect(event?.data).toEqual({ foo: "bar" });
  });

  it("should return null if no events are available", async () => {
    const event = await client.pull("topic", "empty");

    expect(event).toBeNull();
  });
});
