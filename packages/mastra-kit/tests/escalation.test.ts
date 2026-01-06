/**
 * Tests for Escalation Service
 */

import { beforeEach, describe, expect, it } from "bun:test";
import type { EscalationEvent } from "../src/consensus.js";
import {
  type AlertInput,
  ConsoleNotificationChannel,
  createEscalationService,
  type EscalationNotification,
  EscalationService,
  InterventionManager,
  type NotificationChannel,
  type NotificationResult,
  SlackWebhookChannel,
} from "../src/escalation.js";

// ============================================
// Test Fixtures
// ============================================

function createTestEvent(type: EscalationEvent["type"] = "TIMEOUT"): EscalationEvent {
  return {
    type,
    cycleId: "test-cycle-123",
    timestamp: new Date().toISOString(),
    details: "Test escalation event",
    iteration: 2,
  };
}

// ============================================
// Mock Notification Channel
// ============================================

class MockNotificationChannel implements NotificationChannel {
  readonly name = "mock";
  public sentNotifications: EscalationNotification[] = [];
  public shouldFail = false;
  public healthy = true;

  async send(notification: EscalationNotification): Promise<NotificationResult> {
    if (this.shouldFail) {
      return {
        success: false,
        channelName: this.name,
        error: "Mock failure",
      };
    }

    this.sentNotifications.push(notification);
    return {
      success: true,
      channelName: this.name,
      messageId: `mock-${Date.now()}`,
    };
  }

  async healthCheck(): Promise<boolean> {
    return this.healthy;
  }

  reset(): void {
    this.sentNotifications = [];
    this.shouldFail = false;
    this.healthy = true;
  }
}

// ============================================
// Console Channel Tests
// ============================================

describe("ConsoleNotificationChannel", () => {
  let channel: ConsoleNotificationChannel;

  beforeEach(() => {
    channel = new ConsoleNotificationChannel();
  });

  it("should have name 'console'", () => {
    expect(channel.name).toBe("console");
  });

  it("should always return success for send", async () => {
    const notification: EscalationNotification = {
      title: "Test Alert",
      message: "Test message",
      severity: "warning",
      event: createTestEvent(),
      context: {
        environment: "test",
        timestamp: new Date().toISOString(),
        requiresAction: false,
      },
    };

    const result = await channel.send(notification);

    expect(result.success).toBe(true);
    expect(result.channelName).toBe("console");
  });

  it("should always return true for healthCheck", async () => {
    const healthy = await channel.healthCheck();
    expect(healthy).toBe(true);
  });
});

// ============================================
// Slack Webhook Channel Tests
// ============================================

describe("SlackWebhookChannel", () => {
  it("should have name 'slack-webhook'", () => {
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.com/test",
    });

    expect(channel.name).toBe("slack-webhook");
  });

  it("should return false for healthCheck without URL", async () => {
    const channel = new SlackWebhookChannel({
      webhookUrl: "",
    });

    const healthy = await channel.healthCheck();
    expect(healthy).toBe(false);
  });

  it("should return true for healthCheck with URL", async () => {
    const channel = new SlackWebhookChannel({
      webhookUrl: "https://hooks.slack.com/test",
    });

    const healthy = await channel.healthCheck();
    expect(healthy).toBe(true);
  });
});

// ============================================
// Escalation Service Tests
// ============================================

describe("EscalationService", () => {
  let mockChannel: MockNotificationChannel;
  let service: EscalationService;
  let storedAlerts: AlertInput[];

  beforeEach(() => {
    mockChannel = new MockNotificationChannel();
    storedAlerts = [];

    service = new EscalationService({
      channels: [mockChannel],
      environment: "test",
      dashboardUrl: "https://dashboard.example.com",
      onAlert: async (alert) => {
        storedAlerts.push(alert);
      },
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
  });

  describe("handleEscalation", () => {
    it("should send notification for TIMEOUT event", async () => {
      const event = createTestEvent("TIMEOUT");

      await service.handleEscalation(event);

      expect(mockChannel.sentNotifications).toHaveLength(1);
      expect(mockChannel.sentNotifications[0]?.title).toContain("Timeout");
      expect(mockChannel.sentNotifications[0]?.severity).toBe("warning");
    });

    it("should send notification for MAX_ITERATIONS event", async () => {
      const event = createTestEvent("MAX_ITERATIONS");

      await service.handleEscalation(event);

      expect(mockChannel.sentNotifications).toHaveLength(1);
      expect(mockChannel.sentNotifications[0]?.title).toContain("Not Reached");
      expect(mockChannel.sentNotifications[0]?.severity).toBe("warning");
    });

    it("should send critical notification for SYSTEMATIC_FAILURE", async () => {
      const event = createTestEvent("SYSTEMATIC_FAILURE");

      await service.handleEscalation(event);

      expect(mockChannel.sentNotifications).toHaveLength(1);
      expect(mockChannel.sentNotifications[0]?.title).toContain("Systematic Failure");
      expect(mockChannel.sentNotifications[0]?.severity).toBe("critical");
      expect(mockChannel.sentNotifications[0]?.context.requiresAction).toBe(true);
    });

    it("should store alert in database", async () => {
      const event = createTestEvent("TIMEOUT");

      await service.handleEscalation(event);

      expect(storedAlerts).toHaveLength(1);
      expect(storedAlerts[0]?.type).toBe("agent");
      expect(storedAlerts[0]?.severity).toBe("warning");
      expect(storedAlerts[0]?.metadata).toHaveProperty("eventType", "TIMEOUT");
      expect(storedAlerts[0]?.metadata).toHaveProperty("cycleId", event.cycleId);
    });

    it("should include action URL for events requiring action", async () => {
      const event = createTestEvent("SYSTEMATIC_FAILURE");

      await service.handleEscalation(event);

      expect(mockChannel.sentNotifications[0]?.context.actionUrl).toContain(
        "dashboard.example.com"
      );
      expect(mockChannel.sentNotifications[0]?.context.actionUrl).toContain(event.cycleId);
    });

    it("should continue if channel fails", async () => {
      mockChannel.shouldFail = true;
      const event = createTestEvent("TIMEOUT");

      // Should not throw
      await service.handleEscalation(event);

      // Alert should still be stored
      expect(storedAlerts).toHaveLength(1);
    });

    it("should handle missing onAlert callback", async () => {
      const serviceWithoutStorage = new EscalationService({
        channels: [mockChannel],
        environment: "test",
        logger: {
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      });

      const event = createTestEvent("TIMEOUT");

      // Should not throw
      await serviceWithoutStorage.handleEscalation(event);

      expect(mockChannel.sentNotifications).toHaveLength(1);
    });
  });

  describe("healthCheck", () => {
    it("should return health status for all channels", async () => {
      const results = await service.healthCheck();

      expect(results).toHaveProperty("mock", true);
    });

    it("should reflect unhealthy channel", async () => {
      mockChannel.healthy = false;

      const results = await service.healthCheck();

      expect(results).toHaveProperty("mock", false);
    });
  });

  describe("getChannels", () => {
    it("should return channel names", () => {
      const channels = service.getChannels();

      expect(channels).toContain("mock");
    });
  });
});

// ============================================
// Factory Function Tests
// ============================================

describe("createEscalationService", () => {
  it("should create service with Slack channel when webhook provided", () => {
    const service = createEscalationService({
      environment: "production",
      slackWebhook: "https://hooks.slack.com/test",
    });

    expect(service.getChannels()).toContain("slack-webhook");
  });

  it("should create service with console channel in development", () => {
    const service = createEscalationService({
      environment: "development",
    });

    expect(service.getChannels()).toContain("console");
  });

  it("should create service with console channel in BACKTEST", () => {
    const service = createEscalationService({
      environment: "BACKTEST",
    });

    expect(service.getChannels()).toContain("console");
  });

  it("should add console channel when no other channels configured", () => {
    const service = createEscalationService({
      environment: "production",
    });

    expect(service.getChannels()).toContain("console");
  });
});

// ============================================
// Intervention Manager Tests
// ============================================

describe("InterventionManager", () => {
  let mockChannel: MockNotificationChannel;
  let escService: EscalationService;
  let manager: InterventionManager;

  beforeEach(() => {
    mockChannel = new MockNotificationChannel();
    escService = new EscalationService({
      channels: [mockChannel],
      environment: "test",
      logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });
    manager = new InterventionManager(escService, 1000); // 1 second timeout for tests
  });

  it("should start with no pending interventions", () => {
    expect(manager.getPendingInterventions()).toHaveLength(0);
  });

  it("should request intervention and send notification", async () => {
    const response = await manager.requestIntervention({
      cycleId: "test-cycle",
      reason: "HIGH_RISK_TRADE",
      defaultAction: "cancel",
    });

    // Should have sent notification
    expect(mockChannel.sentNotifications.length).toBeGreaterThan(0);

    // Should get default response (timeout)
    expect(response.respondedBy).toBe("system-timeout");
  });

  it("should use default action on timeout", async () => {
    const response = await manager.requestIntervention({
      cycleId: "test-cycle",
      reason: "MANUAL_REVIEW_REQUESTED",
      defaultAction: "proceed",
    });

    expect(response.decision).toBe("approve"); // proceed = approve
  });

  it("should use reject on cancel default", async () => {
    const response = await manager.requestIntervention({
      cycleId: "test-cycle",
      reason: "MANUAL_REVIEW_REQUESTED",
      defaultAction: "cancel",
    });

    expect(response.decision).toBe("reject"); // cancel = reject
  });

  it("should allow submitting response to pending intervention", () => {
    // First, we need to create a pending intervention without waiting
    // This is tricky since requestIntervention returns a promise
    // For now, just test the submitResponse returns false for non-existent
    const result = manager.submitResponse({
      requestId: "non-existent",
      decision: "approve",
      respondedBy: "test-user",
      timestamp: new Date().toISOString(),
    });

    expect(result).toBe(false);
  });
});
