import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import {
  PushSubscriptionVerifier,
  PushSubscriptionVerificationError,
  verifyPushSubscriptionSignature,
  verifyPushSubscriptionSignatureSafe,
} from "./push-subscriptions.js";

describe("PushSubscriptionVerifier", () => {
  const secret = "test-secret-key";
  const verifier = new PushSubscriptionVerifier(secret);

  describe("constructor", () => {
    it("should create verifier with secret", () => {
      expect(() => new PushSubscriptionVerifier(secret)).not.toThrow();
    });

    it("should throw error for empty secret", () => {
      expect(() => new PushSubscriptionVerifier("")).toThrow(
        "Push subscription secret is required",
      );
    });

    it("should throw error for null secret", () => {
      expect(() => new PushSubscriptionVerifier(null as any)).toThrow(
        "Push subscription secret is required",
      );
    });
  });

  describe("parseSignatureHeader", () => {
    it("should parse valid signature header", () => {
      const header = "t=1699564800,v1=abc123";
      const result = verifier.parseSignatureHeader(header);

      expect(result.timestamp).toBe(1699564800);
      expect(result.signature).toBe("abc123");
    });

    it("should parse header with spaces", () => {
      const header = "t=1699564800, v1=abc123";
      const result = verifier.parseSignatureHeader(header);

      expect(result.timestamp).toBe(1699564800);
      expect(result.signature).toBe("abc123");
    });

    it("should parse header with extra elements", () => {
      const header = "t=1699564800,v1=abc123,extra=value";
      const result = verifier.parseSignatureHeader(header);

      expect(result.timestamp).toBe(1699564800);
      expect(result.signature).toBe("abc123");
    });

    it("should throw error for missing header", () => {
      expect(() => verifier.parseSignatureHeader("")).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.parseSignatureHeader("")).toThrow(
        "Signature header is required",
      );
    });

    it("should throw error for missing timestamp", () => {
      const header = "v1=abc123";
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        "Invalid signature header format",
      );
    });

    it("should throw error for missing signature", () => {
      const header = "t=1699564800";
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        "Invalid signature header format",
      );
    });

    it("should throw error for invalid timestamp", () => {
      const header = "t=invalid,v1=abc123";
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        "Invalid timestamp in signature header",
      );
    });

    it("should throw error for malformed header", () => {
      const header = "invalid-format";
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.parseSignatureHeader(header)).toThrow(
        "Invalid signature header format",
      );
    });
  });

  describe("isTimestampValid", () => {
    it("should return true for current timestamp", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      expect(verifier.isTimestampValid(currentTime, 300)).toBe(true);
    });

    it("should return true for timestamp within tolerance", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp = currentTime - 100; // 100 seconds ago
      expect(verifier.isTimestampValid(timestamp, 300)).toBe(true);
    });

    it("should return false for timestamp outside tolerance", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp = currentTime - 400; // 400 seconds ago
      expect(verifier.isTimestampValid(timestamp, 300)).toBe(false);
    });

    it("should return false for future timestamp", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp = currentTime + 100; // 100 seconds in future
      expect(verifier.isTimestampValid(timestamp, 300)).toBe(false);
    });

    it("should handle zero tolerance", () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const timestamp = currentTime - 1; // 1 second ago
      expect(verifier.isTimestampValid(timestamp, 0)).toBe(false);
    });
  });

  describe("calculateSignature", () => {
    it("should calculate correct HMAC-SHA256 signature", () => {
      const timestamp = 1699564800;
      const body = '{"test": "data"}';
      const payload = `${timestamp}.${body}`;

      const expectedSignature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");

      const result = verifier.calculateSignature(timestamp, body);
      expect(result).toBe(expectedSignature);
    });

    it("should produce different signatures for different bodies", () => {
      const timestamp = 1699564800;
      const body1 = '{"test": "data1"}';
      const body2 = '{"test": "data2"}';

      const sig1 = verifier.calculateSignature(timestamp, body1);
      const sig2 = verifier.calculateSignature(timestamp, body2);

      expect(sig1).not.toBe(sig2);
    });

    it("should produce different signatures for different timestamps", () => {
      const body = '{"test": "data"}';
      const timestamp1 = 1699564800;
      const timestamp2 = 1699564801;

      const sig1 = verifier.calculateSignature(timestamp1, body);
      const sig2 = verifier.calculateSignature(timestamp2, body);

      expect(sig1).not.toBe(sig2);
    });
  });

  describe("verifySignature", () => {
    // Helper function to create a valid signature
    const createValidSignature = (timestamp: number, body: string): string => {
      const payload = `${timestamp}.${body}`;
      const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      return `t=${timestamp},v1=${signature}`;
    };

    it("should verify valid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"event": "test", "data": {"message": "hello"}}';
      const signature = createValidSignature(timestamp, body);

      expect(verifier.verifySignature(signature, body)).toBe(true);
    });

    it("should verify signature with custom tolerance", () => {
      const timestamp = Math.floor(Date.now() / 1000) - 500; // 500 seconds ago
      const body = '{"event": "test"}';
      const signature = createValidSignature(timestamp, body);

      expect(
        verifier.verifySignature(signature, body, { tolerance: 600 }),
      ).toBe(true);
    });

    it("should throw error for invalid signature", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"event": "test"}';
      const signature = `t=${timestamp},v1=invalidsignature`;

      expect(() => verifier.verifySignature(signature, body)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.verifySignature(signature, body)).toThrow(
        "Signature verification failed",
      );
    });

    it("should throw error for expired timestamp", () => {
      const timestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
      const body = '{"event": "test"}';
      const signature = createValidSignature(timestamp, body);

      expect(() => verifier.verifySignature(signature, body)).toThrow(
        PushSubscriptionVerificationError,
      );
      expect(() => verifier.verifySignature(signature, body)).toThrow(
        "Request timestamp is too old",
      );
    });

    it("should throw error for malformed signature header", () => {
      const body = '{"event": "test"}';
      const signature = "invalid-header";

      expect(() => verifier.verifySignature(signature, body)).toThrow(
        PushSubscriptionVerificationError,
      );
    });

    it("should handle empty body", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = "";
      const signature = createValidSignature(timestamp, body);

      expect(verifier.verifySignature(signature, body)).toBe(true);
    });

    it("should handle complex JSON body", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = JSON.stringify({
        id: "event-123",
        data: {
          user: { name: "John Doe", email: "john@example.com" },
          action: "purchase",
          items: [
            { id: 1, name: "Product A" },
            { id: 2, name: "Product B" },
          ],
        },
        metadata: { source: "api", version: "1.0" },
      });
      const signature = createValidSignature(timestamp, body);

      expect(verifier.verifySignature(signature, body)).toBe(true);
    });

    it("should be sensitive to body changes", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const originalBody = '{"event": "test", "data": {"message": "hello"}}';
      const modifiedBody = '{"event": "test", "data": {"message": "hello!"}}';
      const signature = createValidSignature(timestamp, originalBody);

      // Should pass with original body
      expect(verifier.verifySignature(signature, originalBody)).toBe(true);

      // Should fail with modified body
      expect(() => verifier.verifySignature(signature, modifiedBody)).toThrow(
        PushSubscriptionVerificationError,
      );
    });

    it("should handle unicode characters in body", () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const body = '{"message": "Hello 🌍 World! 你好"}';
      const signature = createValidSignature(timestamp, body);

      expect(verifier.verifySignature(signature, body)).toBe(true);
    });
  });
});

describe("verifyPushSubscriptionSignature", () => {
  const secret = "test-secret-key";

  const createValidSignature = (timestamp: number, body: string): string => {
    const payload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return `t=${timestamp},v1=${signature}`;
  };

  it("should verify valid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"event": "test"}';
    const signature = createValidSignature(timestamp, body);

    expect(verifyPushSubscriptionSignature(secret, signature, body)).toBe(true);
  });

  it("should throw error for invalid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"event": "test"}';
    const signature = `t=${timestamp},v1=invalidsignature`;

    expect(() =>
      verifyPushSubscriptionSignature(secret, signature, body),
    ).toThrow(PushSubscriptionVerificationError);
  });

  it("should respect custom tolerance", () => {
    const timestamp = Math.floor(Date.now() / 1000) - 500; // 500 seconds ago
    const body = '{"event": "test"}';
    const signature = createValidSignature(timestamp, body);

    expect(
      verifyPushSubscriptionSignature(secret, signature, body, {
        tolerance: 600,
      }),
    ).toBe(true);
  });
});

describe("verifyPushSubscriptionSignatureSafe", () => {
  const secret = "test-secret-key";

  const createValidSignature = (timestamp: number, body: string): string => {
    const payload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    return `t=${timestamp},v1=${signature}`;
  };

  it("should return true for valid signature", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"event": "test"}';
    const signature = createValidSignature(timestamp, body);

    expect(verifyPushSubscriptionSignatureSafe(secret, signature, body)).toBe(
      true,
    );
  });

  it("should return false for invalid signature instead of throwing", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const body = '{"event": "test"}';
    const signature = `t=${timestamp},v1=invalidsignature`;

    expect(verifyPushSubscriptionSignatureSafe(secret, signature, body)).toBe(
      false,
    );
  });

  it("should return false for expired timestamp instead of throwing", () => {
    const timestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
    const body = '{"event": "test"}';
    const signature = createValidSignature(timestamp, body);

    expect(verifyPushSubscriptionSignatureSafe(secret, signature, body)).toBe(
      false,
    );
  });

  it("should return false for malformed signature instead of throwing", () => {
    const body = '{"event": "test"}';
    const signature = "invalid-header";

    expect(verifyPushSubscriptionSignatureSafe(secret, signature, body)).toBe(
      false,
    );
  });
});

describe("PushSubscriptionVerificationError", () => {
  it("should create error with message and code", () => {
    const error = new PushSubscriptionVerificationError(
      "Test message",
      "TEST_CODE",
    );

    expect(error.message).toBe("Test message");
    expect(error.code).toBe("TEST_CODE");
    expect(error.name).toBe("PushSubscriptionVerificationError");
  });

  it("should be instanceof Error", () => {
    const error = new PushSubscriptionVerificationError(
      "Test message",
      "TEST_CODE",
    );

    expect(error instanceof Error).toBe(true);
    expect(error instanceof PushSubscriptionVerificationError).toBe(true);
  });
});

describe("Real-world examples", () => {
  const secret = "whsec_test_secret";

  it("should handle example from documentation", () => {
    // This mirrors the example signature format from the docs
    const timestamp = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
    const body =
      '{"id":"evt_123","data":{"user":"john@example.com","action":"signup"},"timestamp":"2023-11-09T16:00:00Z"}';

    // Create signature manually to match docs format
    const payload = `${timestamp}.${body}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const header = `t=${timestamp},v1=${signature}`;

    const verifier = new PushSubscriptionVerifier(secret);

    // Should pass with default tolerance
    expect(verifier.verifySignature(header, body)).toBe(true);
  });

  it("should handle Express.js raw body scenario", () => {
    // Simulate Express with express.raw({ type: 'application/json' })
    const timestamp = Math.floor(Date.now() / 1000);
    const jsonData = {
      event: "user.created",
      data: { id: 123, email: "user@example.com" },
    };
    const body = JSON.stringify(jsonData);

    // Simulate raw body as Buffer (common in Express)
    const bodyBuffer = Buffer.from(body, "utf8");
    const bodyString = bodyBuffer.toString("utf8");

    const payload = `${timestamp}.${bodyString}`;
    const signature = createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const header = `t=${timestamp},v1=${signature}`;

    const verifier = new PushSubscriptionVerifier(secret);
    expect(verifier.verifySignature(header, bodyString)).toBe(true);
  });

  it("should handle different content types", () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const verifier = new PushSubscriptionVerifier(secret);

    // Test with different JSON structures
    const testCases = [
      '{"simple": "object"}',
      '{"nested": {"deep": {"value": 123}}}',
      '{"array": [1, 2, 3, "string", {"nested": true}]}',
      '{"unicode": "测试 🚀 émoji"}',
      '{"number": 123.456, "boolean": true, "null": null}',
      "[]", // Empty array
      "{}", // Empty object
    ];

    testCases.forEach((body) => {
      const payload = `${timestamp}.${body}`;
      const signature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      const header = `t=${timestamp},v1=${signature}`;

      expect(verifier.verifySignature(header, body)).toBe(true);
    });
  });
});
