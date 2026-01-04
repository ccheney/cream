/**
 * Error Panel Stories
 *
 * Storybook stories for error panel components.
 *
 * @see docs/plans/ui/28-states.md lines 83-87
 */

import type { Meta, StoryObj } from "@storybook/react";
import { ApiErrorPanel, ConnectionErrorPanel, ErrorInline, ErrorPanel } from "./error-panel";

// ============================================
// ErrorPanel Stories
// ============================================

const meta: Meta<typeof ErrorPanel> = {
  title: "UI/Feedback/ErrorPanel",
  component: ErrorPanel,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Error panel component with title, message, hint, and optional actions.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["error", "warning", "info"],
      description: "Panel variant",
    },
    dismissible: {
      control: "boolean",
      description: "Show dismiss button",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ErrorPanel>;

export const Default: Story = {
  args: {
    title: "Something went wrong",
    message: "We encountered an unexpected error while processing your request.",
  },
};

export const WithHint: Story = {
  args: {
    title: "Connection failed",
    message: "Unable to connect to the server.",
    hint: "Check your internet connection and try again.",
  },
};

export const WithErrorCode: Story = {
  args: {
    title: "Request failed",
    message: "The server returned an error.",
    errorCode: "ERR-500",
  },
};

export const WithActions: Story = {
  args: {
    title: "Failed to load data",
    message: "Unable to fetch the requested data.",
    actions: [
      { label: "Try Again", onClick: () => alert("Retry"), variant: "primary" },
      { label: "Cancel", onClick: () => alert("Cancel"), variant: "secondary" },
    ],
  },
};

export const Dismissible: Story = {
  args: {
    title: "Warning",
    message: "Your session will expire soon.",
    dismissible: true,
    onDismiss: () => alert("Dismissed"),
  },
};

export const WarningVariant: Story = {
  args: {
    title: "Heads up",
    message: "This action cannot be undone.",
    variant: "warning",
  },
};

export const InfoVariant: Story = {
  args: {
    title: "Note",
    message: "Market data may be delayed up to 15 minutes.",
    variant: "info",
  },
};

// ============================================
// ErrorInline Stories
// ============================================

export const InlineError: StoryObj<typeof ErrorInline> = {
  render: (args) => <ErrorInline {...args} />,
  args: {
    message: "Invalid email address",
  },
  parameters: {
    docs: {
      description: {
        story: "Compact inline error for form fields.",
      },
    },
  },
};

// ============================================
// ApiErrorPanel Stories
// ============================================

export const ApiError: StoryObj<typeof ApiErrorPanel> = {
  render: (args) => <ApiErrorPanel {...args} />,
  args: {
    error: {
      message: "Failed to fetch portfolio data",
      code: "NETWORK_ERROR",
      statusCode: 503,
    },
    onRetry: () => alert("Retrying..."),
    onDismiss: () => alert("Dismissed"),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset panel for API errors with retry and dismiss.",
      },
    },
  },
};

export const ApiErrorMinimal: StoryObj<typeof ApiErrorPanel> = {
  render: (args) => <ApiErrorPanel {...args} />,
  args: {
    error: {
      message: "Request timeout",
    },
  },
};

// ============================================
// ConnectionErrorPanel Stories
// ============================================

export const ConnectionError: StoryObj<typeof ConnectionErrorPanel> = {
  render: (args) => <ConnectionErrorPanel {...args} />,
  args: {
    onRetry: () => alert("Reconnecting..."),
  },
  parameters: {
    docs: {
      description: {
        story: "Preset panel for connection errors.",
      },
    },
  },
};

// ============================================
// All Variants
// ============================================

export const AllVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "400px" }}>
      <ErrorPanel variant="error" title="Error" message="This is an error message." />
      <ErrorPanel variant="warning" title="Warning" message="This is a warning message." />
      <ErrorPanel variant="info" title="Info" message="This is an info message." />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All error panel variants.",
      },
    },
  },
};
