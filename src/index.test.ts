import { EventRequests } from "../test/utils.js";
import { SailhouseClient, PushSubscriptionVerificationError } from "./index.js";
import { beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "crypto";

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

  describe("push subscription verification", () => {
    const secret = "test-secret-key";

    const createValidSignature = (timestamp: number, body: string): string => {
      const payload = `${timestamp}.${body}`;
      const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      return `t=${timestamp},v1=${signature}`;
    };

    it("should verify valid push subscription signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"event": "test", "data": {"message": "hello"}}';
      const signature = createValidSignature(timestamp, body);

      expect(client.verifyPushSubscription(signature, body, secret)).toBe(true);
    });

    it("should throw error for invalid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"event": "test"}';
      const signature = `t=${timestamp},v1=invalidsignature`;

      expect(() =>
        client.verifyPushSubscription(signature, body, secret),
      ).toThrow(PushSubscriptionVerificationError);
    });

    it("should create push subscription verifier", () => {
      const verifier = client.createPushSubscriptionVerifier(secret);

      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"event": "test"}';
      const signature = createValidSignature(timestamp, body);

      expect(verifier.verifySignature(signature, body)).toBe(true);
    });

    it("should respect custom tolerance", () => {
      const timestamp = Math.floor(Date.now() / 1000) - 500; // 500 seconds ago
      const body = '{"event": "test"}';
      const signature = createValidSignature(timestamp, body);

      expect(
        client.verifyPushSubscription(signature, body, secret, {
          tolerance: 600,
        }),
      ).toBe(true);
    });
  });
});
