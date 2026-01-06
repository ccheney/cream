/**
 * Escalation Service - Human-in-the-Loop Notifications
 *
 * Handles escalation events from the consensus system:
 * - TIMEOUT: Agent failed to respond within time limit
 * - MAX_ITERATIONS: Consensus not reached after retries
 * - SYSTEMATIC_FAILURE: Multiple consecutive failures
 *
 * Notifications are sent via configurable channels (Slack, email, etc.)
 * and stored in the database for auditing.
 *
 * @see docs/plans/05-agents.md
 * @see docs/plans/13-operations.md
 */

import type { EscalationEvent } from "./consensus.js";

// ============================================
// Notification Channel Interface
// ============================================

/**
 * Notification channel interface.
 * Implement this for each notification method (Slack, email, SMS, etc.)
 */
export interface NotificationChannel {
  /** Channel name for logging */
  readonly name: string;

  /** Send a notification */
  send(notification: EscalationNotification): Promise<NotificationResult>;

  /** Check if channel is healthy */
  healthCheck(): Promise<boolean>;
}

/**
 * Notification payload for channels.
 */
export interface EscalationNotification {
  /** Notification title */
  title: string;

  /** Notification message */
  message: string;

  /** Severity level */
  severity: "warning" | "critical";

  /** Source event */
  event: EscalationEvent;

  /** Additional context */
  context: {
    environment: string;
    timestamp: string;
    requiresAction: boolean;
    actionUrl?: string;
  };
}

/**
 * Result of sending a notification.
 */
export interface NotificationResult {
  success: boolean;
  channelName: string;
  error?: string;
  messageId?: string;
}

// ============================================
// Slack Webhook Channel
// ============================================

/**
 * Slack webhook configuration.
 */
export interface SlackWebhookConfig {
  /** Webhook URL */
  webhookUrl: string;

  /** Default channel (overridable) */
  defaultChannel?: string;

  /** Bot username */
  username?: string;

  /** Emoji icon */
  iconEmoji?: string;
}

/**
 * Slack notification channel using webhooks.
 */
export class SlackWebhookChannel implements NotificationChannel {
  readonly name = "slack-webhook";
  private readonly config: SlackWebhookConfig;

  constructor(config: SlackWebhookConfig) {
    this.config = config;
  }

  async send(notification: EscalationNotification): Promise<NotificationResult> {
    const color = notification.severity === "critical" ? "#dc2626" : "#f59e0b";
    const emoji = notification.severity === "critical" ? ":rotating_light:" : ":warning:";

    const payload = {
      username: this.config.username ?? "Cream Trading Bot",
      icon_emoji: this.config.iconEmoji ?? ":chart_with_upwards_trend:",
      channel: this.config.defaultChannel,
      attachments: [
        {
          color,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${emoji} ${notification.title}`,
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: notification.message,
              },
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: `*Environment:* ${notification.context.environment} | *Cycle:* ${notification.event.cycleId} | *Iteration:* ${notification.event.iteration}`,
                },
              ],
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Type:* ${notification.event.type}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Timestamp:* ${notification.context.timestamp}`,
                },
              ],
            },
            ...(notification.context.requiresAction
              ? [
                  {
                    type: "actions",
                    elements: [
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "View Details",
                          emoji: true,
                        },
                        url: notification.context.actionUrl ?? "#",
                        style: "primary",
                      },
                      {
                        type: "button",
                        text: {
                          type: "plain_text",
                          text: "Acknowledge",
                          emoji: true,
                        },
                        action_id: `acknowledge_${notification.event.cycleId}`,
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
      ],
    };

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          channelName: this.name,
          error: `Slack webhook failed: ${response.status} - ${error}`,
        };
      }

      return {
        success: true,
        channelName: this.name,
      };
    } catch (error) {
      return {
        success: false,
        channelName: this.name,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    // Slack webhooks don't have a health check endpoint
    // Just verify the URL is configured
    return !!this.config.webhookUrl;
  }
}

// ============================================
// Console Logger Channel (for development)
// ============================================

/**
 * Console notification channel for development/testing.
 */
export class ConsoleNotificationChannel implements NotificationChannel {
  readonly name = "console";

  async send(notification: EscalationNotification): Promise<NotificationResult> {
    const _prefix = notification.severity === "critical" ? "🚨 CRITICAL" : "⚠️ WARNING";
    if (notification.context.requiresAction) {
    }

    return {
      success: true,
      channelName: this.name,
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

// ============================================
// Escalation Service
// ============================================

/**
 * Escalation service configuration.
 */
export interface EscalationServiceConfig {
  /** Notification channels */
  channels: NotificationChannel[];

  /** Environment name */
  environment: string;

  /** Dashboard URL for action links */
  dashboardUrl?: string;

  /** Alert storage callback (for database persistence) */
  onAlert?: (alert: AlertInput) => Promise<void>;

  /** Logger */
  logger?: EscalationLogger;
}

/**
 * Alert input for database storage.
 */
export interface AlertInput {
  id: string;
  severity: "warning" | "critical";
  type: "agent";
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  environment: string;
}

/**
 * Logger interface for escalation service.
 */
export interface EscalationLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

const DEFAULT_LOGGER: EscalationLogger = {
  info: (_msg, _data) => {},
  warn: (_msg, _data) => {},
  error: (_msg, _data) => {},
};

/**
 * Escalation service for handling consensus failures and notifying operators.
 */
export class EscalationService {
  private readonly config: EscalationServiceConfig;
  private readonly logger: EscalationLogger;

  constructor(config: EscalationServiceConfig) {
    this.config = config;
    this.logger = config.logger ?? DEFAULT_LOGGER;
  }

  /**
   * Handle an escalation event.
   * Stores alert and sends notifications to all channels.
   */
  async handleEscalation(event: EscalationEvent): Promise<void> {
    const notification = this.createNotification(event);

    this.logger.warn("Escalation event received", {
      type: event.type,
      cycleId: event.cycleId,
      iteration: event.iteration,
    });

    // Store alert in database if callback provided
    if (this.config.onAlert) {
      const alert: AlertInput = {
        id: `alert-${event.cycleId}-${event.iteration}-${Date.now()}`,
        severity: notification.severity,
        type: "agent",
        title: notification.title,
        message: notification.message,
        metadata: {
          eventType: event.type,
          cycleId: event.cycleId,
          iteration: event.iteration,
          details: event.details,
        },
        environment: this.config.environment,
      };

      try {
        await this.config.onAlert(alert);
        this.logger.info("Alert stored", { alertId: alert.id });
      } catch (error) {
        this.logger.error("Failed to store alert", {
          error: error instanceof Error ? error.message : "Unknown",
        });
      }
    }

    // Send notifications to all channels in parallel
    const results = await Promise.all(
      this.config.channels.map((channel) => channel.send(notification))
    );

    // Log results
    for (const result of results) {
      if (result.success) {
        this.logger.info(`Notification sent via ${result.channelName}`);
      } else {
        this.logger.error(`Notification failed via ${result.channelName}`, {
          error: result.error,
        });
      }
    }
  }

  /**
   * Create notification from escalation event.
   */
  private createNotification(event: EscalationEvent): EscalationNotification {
    const severity = event.type === "SYSTEMATIC_FAILURE" ? "critical" : "warning";
    const requiresAction = event.type === "SYSTEMATIC_FAILURE";

    let title: string;
    let message: string;

    switch (event.type) {
      case "TIMEOUT":
        title = "Consensus Timeout";
        message = `Trading cycle ${event.cycleId} timed out at iteration ${event.iteration}. The system defaulted to NO_TRADE for safety. ${event.details}`;
        break;

      case "MAX_ITERATIONS":
        title = "Consensus Not Reached";
        message = `Trading cycle ${event.cycleId} failed to reach consensus after ${event.iteration} iterations. The system defaulted to NO_TRADE. Review agent disagreements in logs.`;
        break;

      case "SYSTEMATIC_FAILURE":
        title = "⚠️ Systematic Failure Detected";
        message = `Multiple consecutive failures detected in trading cycle ${event.cycleId}. ${event.details}\n\n*Immediate operator review recommended.*`;
        break;

      default:
        title = "Escalation Event";
        message = event.details;
    }

    return {
      title,
      message,
      severity,
      event,
      context: {
        environment: this.config.environment,
        timestamp: event.timestamp,
        requiresAction,
        actionUrl: this.config.dashboardUrl
          ? `${this.config.dashboardUrl}/alerts?cycle=${event.cycleId}`
          : undefined,
      },
    };
  }

  /**
   * Check health of all notification channels.
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const channel of this.config.channels) {
      results[channel.name] = await channel.healthCheck();
    }

    return results;
  }

  /**
   * Get configured channels.
   */
  getChannels(): string[] {
    return this.config.channels.map((c) => c.name);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create an escalation handler callback for ConsensusGate.
 *
 * @example
 * ```typescript
 * const service = createEscalationService({
 *   environment: process.env.CREAM_ENV ?? "development",
 *   slackWebhook: process.env.SLACK_WEBHOOK_URL,
 *   dashboardUrl: process.env.DASHBOARD_URL,
 * });
 *
 * const gate = new ConsensusGate({
 *   escalation: {
 *     enabled: true,
 *     onEscalation: service.handleEscalation.bind(service),
 *   },
 * });
 * ```
 */
export function createEscalationService(options: {
  environment: string;
  slackWebhook?: string;
  dashboardUrl?: string;
  onAlert?: (alert: AlertInput) => Promise<void>;
  logger?: EscalationLogger;
}): EscalationService {
  const channels: NotificationChannel[] = [];

  // Add Slack if configured
  if (options.slackWebhook) {
    channels.push(
      new SlackWebhookChannel({
        webhookUrl: options.slackWebhook,
      })
    );
  }

  // Always add console logger in development
  if (
    options.environment === "development" ||
    options.environment === "BACKTEST" ||
    channels.length === 0
  ) {
    channels.push(new ConsoleNotificationChannel());
  }

  return new EscalationService({
    channels,
    environment: options.environment,
    dashboardUrl: options.dashboardUrl,
    onAlert: options.onAlert,
    logger: options.logger,
  });
}

/**
 * Create an escalation handler from environment variables.
 */
export function createEscalationServiceFromEnv(): EscalationService {
  return createEscalationService({
    environment: process.env.CREAM_ENV ?? "development",
    slackWebhook: process.env.SLACK_WEBHOOK_URL,
    dashboardUrl: process.env.DASHBOARD_URL,
  });
}

// ============================================
// Human-in-the-Loop Intervention Types
// ============================================

/**
 * Human intervention request.
 * Sent when the system needs operator approval before proceeding.
 */
export interface InterventionRequest {
  /** Request ID */
  id: string;

  /** Trading cycle ID */
  cycleId: string;

  /** Reason for intervention */
  reason: InterventionReason;

  /** Proposed action (if any) */
  proposedAction?: {
    description: string;
    riskLevel: "low" | "medium" | "high";
  };

  /** Deadline for response (after which system takes default action) */
  deadline: string;

  /** Default action if no response */
  defaultAction: "proceed" | "cancel";

  /** Request timestamp */
  timestamp: string;
}

/**
 * Reason for human intervention.
 */
export type InterventionReason =
  | "SYSTEMATIC_FAILURE"
  | "HIGH_RISK_TRADE"
  | "UNUSUAL_MARKET_CONDITIONS"
  | "MANUAL_REVIEW_REQUESTED";

/**
 * Human intervention response.
 */
export interface InterventionResponse {
  /** Request ID being responded to */
  requestId: string;

  /** Decision */
  decision: "approve" | "reject" | "modify";

  /** Operator who responded */
  respondedBy: string;

  /** Response timestamp */
  timestamp: string;

  /** Notes from operator */
  notes?: string;

  /** Modified parameters (if decision is "modify") */
  modifications?: Record<string, unknown>;
}

/**
 * Intervention manager for human-in-the-loop workflows.
 *
 * In production, this would integrate with:
 * - Slack interactive messages
 * - Dashboard approval UI
 * - Mobile push notifications
 */
export class InterventionManager {
  private pendingInterventions = new Map<string, InterventionRequest>();
  private readonly escService: EscalationService;
  private readonly defaultTimeoutMs: number;

  constructor(
    escService: EscalationService,
    defaultTimeoutMs = 300000 // 5 minutes
  ) {
    this.escService = escService;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  /**
   * Request human intervention.
   * Returns a promise that resolves when the operator responds or timeout occurs.
   */
  async requestIntervention(
    request: Omit<InterventionRequest, "id" | "timestamp" | "deadline">
  ): Promise<InterventionResponse> {
    const fullRequest: InterventionRequest = {
      ...request,
      id: `intervention-${request.cycleId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      deadline: new Date(Date.now() + this.defaultTimeoutMs).toISOString(),
    };

    this.pendingInterventions.set(fullRequest.id, fullRequest);

    // Send notification
    await this.escService.handleEscalation({
      type: "SYSTEMATIC_FAILURE",
      cycleId: fullRequest.cycleId,
      timestamp: fullRequest.timestamp,
      details: `Human intervention required: ${fullRequest.reason}. Deadline: ${fullRequest.deadline}`,
      iteration: 0,
    });

    // Wait for response or timeout
    return this.waitForResponse(fullRequest);
  }

  /**
   * Submit a response to an intervention request.
   */
  submitResponse(response: InterventionResponse): boolean {
    if (!this.pendingInterventions.has(response.requestId)) {
      return false;
    }

    this.pendingInterventions.delete(response.requestId);
    // In production, this would resolve the promise from waitForResponse
    return true;
  }

  /**
   * Get pending intervention requests.
   */
  getPendingInterventions(): InterventionRequest[] {
    return Array.from(this.pendingInterventions.values());
  }

  /**
   * Wait for response or timeout.
   * In production, this would use a proper async mechanism.
   */
  private async waitForResponse(request: InterventionRequest): Promise<InterventionResponse> {
    const deadline = new Date(request.deadline).getTime();
    const now = Date.now();
    const timeout = deadline - now;

    // For now, immediately return default action
    // In production, this would wait for a callback or poll
    return new Promise((resolve) => {
      setTimeout(
        () => {
          // Check if still pending (not responded to)
          if (this.pendingInterventions.has(request.id)) {
            this.pendingInterventions.delete(request.id);

            resolve({
              requestId: request.id,
              decision: request.defaultAction === "proceed" ? "approve" : "reject",
              respondedBy: "system-timeout",
              timestamp: new Date().toISOString(),
              notes: "No response received within deadline, using default action",
            });
          }
        },
        Math.min(timeout, 1000)
      ); // Cap at 1 second for testing, production would use full timeout
    });
  }
}
