import { createHmac, timingSafeEqual } from "crypto";

/**
 * Error thrown when push subscription signature verification fails
 */
export class PushSubscriptionVerificationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PushSubscriptionVerificationError";
  }
}

/**
 * Parsed signature header components
 */
export interface SignatureComponents {
  timestamp: number;
  signature: string;
}

/**
 * Headers expected from a push subscription request
 */
export interface PushSubscriptionHeaders {
  "sailhouse-signature": string;
  identifier: string;
  "event-id": string;
}

/**
 * Push subscription payload structure
 */
export interface PushSubscriptionPayload<T = any> {
  data: T;
  metadata?: Record<string, any>;
  id: string;
  timestamp: string;
}

/**
 * Verification options
 */
export interface VerificationOptions {
  /** Tolerance for timestamp validation in seconds (default: 300) */
  tolerance?: number;
}

/**
 * Push subscription signature verifier
 */
export class PushSubscriptionVerifier {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret) {
      throw new Error("Push subscription secret is required");
    }
    this.secret = secret;
  }

  /**
   * Verify a push subscription signature
   * @param signature The Sailhouse-Signature header value
   * @param body The raw request body as string
   * @param options Verification options
   * @returns true if signature is valid
   * @throws PushSubscriptionVerificationError if verification fails
   */
  verifySignature(
    signature: string,
    body: string,
    options: VerificationOptions = {},
  ): boolean {
    const tolerance = options.tolerance ?? 300;

    try {
      // Parse signature header
      const { timestamp, signature: headerSignature } =
        this.parseSignatureHeader(signature);

      // Validate timestamp
      if (!this.isTimestampValid(timestamp, tolerance)) {
        throw new PushSubscriptionVerificationError(
          `Request timestamp is too old. Maximum age: ${tolerance} seconds`,
          "TIMESTAMP_TOO_OLD",
        );
      }

      // Calculate expected signature
      const expectedSignature = this.calculateSignature(timestamp, body);

      // Perform constant-time comparison
      if (!this.constantTimeEqual(expectedSignature, headerSignature)) {
        throw new PushSubscriptionVerificationError(
          "Signature verification failed",
          "INVALID_SIGNATURE",
        );
      }

      return true;
    } catch (error) {
      if (error instanceof PushSubscriptionVerificationError) {
        throw error;
      }
      throw new PushSubscriptionVerificationError(
        `Signature verification failed: ${error instanceof Error ? error.message : String(error)}`,
        "VERIFICATION_ERROR",
      );
    }
  }

  /**
   * Parse the Sailhouse-Signature header
   * @param header The signature header value
   * @returns Parsed timestamp and signature
   */
  parseSignatureHeader(header: string): SignatureComponents {
    if (!header) {
      throw new PushSubscriptionVerificationError(
        "Signature header is required",
        "MISSING_SIGNATURE_HEADER",
      );
    }

    const elements = header.split(",");
    let timestamp: number | undefined;
    let signature: string | undefined;

    for (const element of elements) {
      const trimmed = element.trim();
      const [key, value] = trimmed.split("=");

      if (key === "t") {
        const parsedTimestamp = parseInt(value, 10);
        if (isNaN(parsedTimestamp)) {
          throw new PushSubscriptionVerificationError(
            "Invalid timestamp in signature header",
            "INVALID_TIMESTAMP",
          );
        }
        timestamp = parsedTimestamp;
      } else if (key === "v1") {
        signature = value;
      }
    }

    if (timestamp === undefined || !signature) {
      throw new PushSubscriptionVerificationError(
        "Invalid signature header format. Expected format: t=<timestamp>,v1=<signature>",
        "INVALID_SIGNATURE_FORMAT",
      );
    }

    return { timestamp, signature };
  }

  /**
   * Check if timestamp is within tolerance
   * @param timestamp The timestamp to validate
   * @param tolerance Maximum age in seconds
   * @returns true if timestamp is valid
   */
  isTimestampValid(timestamp: number, tolerance: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000);
    return currentTime - timestamp <= tolerance && timestamp <= currentTime;
  }

  /**
   * Calculate HMAC-SHA256 signature for the payload
   * @param timestamp The timestamp from the signature header
   * @param body The raw request body
   * @returns Hex-encoded signature
   */
  calculateSignature(timestamp: number, body: string): string {
    const payload = `${timestamp}.${body}`;
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }

  /**
   * Perform constant-time comparison to prevent timing attacks
   * @param expected The expected signature
   * @param actual The actual signature from header
   * @returns true if signatures match
   */
  private constantTimeEqual(expected: string, actual: string): boolean {
    try {
      return timingSafeEqual(
        Buffer.from(expected, "hex"),
        Buffer.from(actual, "hex"),
      );
    } catch {
      return false;
    }
  }
}

/**
 * Convenience function for one-off signature verification
 * @param secret The push subscription secret
 * @param signature The Sailhouse-Signature header value
 * @param body The raw request body as string
 * @param options Verification options
 * @returns true if signature is valid
 * @throws PushSubscriptionVerificationError if verification fails
 */
export function verifyPushSubscriptionSignature(
  secret: string,
  signature: string,
  body: string,
  options: VerificationOptions = {},
): boolean {
  const verifier = new PushSubscriptionVerifier(secret);
  return verifier.verifySignature(signature, body, options);
}

/**
 * Safe verification that returns a boolean instead of throwing
 * @param secret The push subscription secret
 * @param signature The Sailhouse-Signature header value
 * @param body The raw request body as string
 * @param options Verification options
 * @returns true if signature is valid, false otherwise
 */
export function verifyPushSubscriptionSignatureSafe(
  secret: string,
  signature: string,
  body: string,
  options: VerificationOptions = {},
): boolean {
  try {
    return verifyPushSubscriptionSignature(secret, signature, body, options);
  } catch {
    return false;
  }
}
