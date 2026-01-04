/**
 * Connection Banner Stories
 *
 * Storybook stories for WebSocket disconnection banner.
 *
 * @see docs/plans/ui/28-states.md lines 115-117
 */

import type { Meta, StoryObj } from "@storybook/react";
import React from "react";
import type { ConnectionState } from "./connection-banner";
import {
  ConnectionBanner,
  DisconnectionBanner,
  OfflineBanner,
  ReconnectingBanner,
} from "./connection-banner";

// ============================================
// ConnectionBanner Stories
// ============================================

const meta: Meta<typeof ConnectionBanner> = {
  title: "UI/Status/ConnectionBanner",
  component: ConnectionBanner,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: "Banner for displaying WebSocket connection status with reconnection.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    state: {
      control: "select",
      options: ["connected", "connecting", "disconnected", "reconnecting", "failed"],
      description: "Connection state",
    },
  },
  decorators: [
    (Story) => (
      <div style={{ minHeight: "200px", backgroundColor: "#fafaf9" }}>
        <Story />
        <div style={{ padding: "20px" }}>
          <p>Page content goes here...</p>
        </div>
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof ConnectionBanner>;

// ============================================
// Connection States
// ============================================

export const Connected: Story = {
  args: {
    state: "connected",
  },
  parameters: {
    docs: {
      description: {
        story: "Connected state - banner is hidden.",
      },
    },
  },
};

export const Connecting: Story = {
  args: {
    state: "connecting",
  },
};

export const Disconnected: Story = {
  args: {
    state: "disconnected",
    onReconnect: () => alert("Reconnecting..."),
  },
};

export const Reconnecting: Story = {
  args: {
    state: "reconnecting",
    retryCount: 3,
    nextRetryIn: 8,
  },
};

export const Failed: Story = {
  args: {
    state: "failed",
    onReconnect: () => alert("Reconnecting..."),
  },
};

// ============================================
// Retry States
// ============================================

export const ReconnectingWithProgress: Story = {
  args: {
    state: "reconnecting",
    retryCount: 2,
    nextRetryIn: 4,
    maxRetries: 5,
  },
  parameters: {
    docs: {
      description: {
        story: "Reconnecting with retry count and countdown.",
      },
    },
  },
};

export const MaxRetriesReached: Story = {
  args: {
    state: "failed",
    retryCount: 5,
    maxRetries: 5,
    onReconnect: () => alert("Manual reconnect"),
  },
  parameters: {
    docs: {
      description: {
        story: "Failed state after max retries reached.",
      },
    },
  },
};

// ============================================
// Preset Banners
// ============================================

export const DisconnectedBanner: StoryObj<typeof DisconnectionBanner> = {
  render: (args) => (
    <div style={{ minHeight: "200px", backgroundColor: "#fafaf9" }}>
      <DisconnectionBanner {...args} />
      <div style={{ padding: "20px" }}>
        <p>Page content goes here...</p>
      </div>
    </div>
  ),
  args: {
    onReconnect: () => alert("Reconnecting..."),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset banner for disconnected state.",
      },
    },
  },
};

export const ReconnectingBannerPreset: StoryObj<typeof ReconnectingBanner> = {
  render: (args) => (
    <div style={{ minHeight: "200px", backgroundColor: "#fafaf9" }}>
      <ReconnectingBanner {...args} />
      <div style={{ padding: "20px" }}>
        <p>Page content goes here...</p>
      </div>
    </div>
  ),
  args: {
    retryCount: 2,
    nextRetryIn: 5,
  },
  parameters: {
    docs: {
      description: {
        story: "Preset banner for reconnecting state.",
      },
    },
  },
};

export const OfflineBannerPreset: StoryObj<typeof OfflineBanner> = {
  render: (args) => (
    <div style={{ minHeight: "200px", backgroundColor: "#fafaf9" }}>
      <OfflineBanner {...args} />
      <div style={{ padding: "20px" }}>
        <p>Page content goes here...</p>
      </div>
    </div>
  ),
  args: {
    onRetry: () => alert("Retrying..."),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset banner for offline state.",
      },
    },
  },
};

// ============================================
// All States
// ============================================

export const AllStates: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div>
        <p style={{ padding: "8px", fontSize: "12px", color: "#78716c" }}>Connecting:</p>
        <ConnectionBanner state="connecting" />
      </div>
      <div>
        <p style={{ padding: "8px", fontSize: "12px", color: "#78716c" }}>Disconnected:</p>
        <ConnectionBanner state="disconnected" onReconnect={() => {}} />
      </div>
      <div>
        <p style={{ padding: "8px", fontSize: "12px", color: "#78716c" }}>Reconnecting:</p>
        <ConnectionBanner state="reconnecting" retryCount={2} nextRetryIn={5} />
      </div>
      <div>
        <p style={{ padding: "8px", fontSize: "12px", color: "#78716c" }}>Failed:</p>
        <ConnectionBanner state="failed" onReconnect={() => {}} />
      </div>
    </div>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: "All connection banner states.",
      },
    },
  },
};

// ============================================
// Interactive Demo
// ============================================

function InteractiveDemo() {
  const [state, setState] = React.useState<ConnectionState>("connected");
  const [retryCount, setRetryCount] = React.useState(0);

  const simulateDisconnect = () => {
    setState("disconnected");
  };

  const simulateReconnect = () => {
    setState("reconnecting");
    setRetryCount((c) => c + 1);
    setTimeout(() => {
      if (Math.random() > 0.5) {
        setState("connected");
        setRetryCount(0);
      } else {
        setState("failed");
      }
    }, 2000);
  };

  return (
    <div>
      <ConnectionBanner
        state={state}
        retryCount={retryCount}
        nextRetryIn={5}
        onReconnect={simulateReconnect}
      />
      <div style={{ padding: "20px" }}>
        <p style={{ marginBottom: "16px" }}>
          Current state: <strong>{state}</strong>
        </p>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={simulateDisconnect}
            style={{
              padding: "8px 16px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Simulate Disconnect
          </button>
          <button
            onClick={() => {
              setState("connected");
              setRetryCount(0);
            }}
            style={{
              padding: "8px 16px",
              backgroundColor: "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Reset to Connected
          </button>
        </div>
      </div>
    </div>
  );
}

export const Interactive: StoryObj = {
  render: () => <InteractiveDemo />,
  parameters: {
    docs: {
      description: {
        story: "Interactive demo of connection state transitions.",
      },
    },
  },
};
