/**
 * Toast Stories
 *
 * Storybook stories for toast notification components.
 *
 * @see docs/plans/ui/28-states.md lines 125-130
 */

import type { Meta, StoryObj } from "@storybook/react";
import { useToastStore } from "../../stores/toast-store";
import { ToastContainer, ToastItem } from "./toast";

// ============================================
// ToastItem Stories
// ============================================

const meta: Meta<typeof ToastItem> = {
  title: "UI/Feedback/Toast",
  component: ToastItem,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Toast notification component with auto-dismiss and queue management.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["success", "error", "warning", "info"],
      description: "Toast variant",
    },
  },
};

export default meta;

type Story = StoryObj<typeof ToastItem>;

export const Success: Story = {
  args: {
    id: "1",
    variant: "success",
    message: "Changes saved successfully!",
    onDismiss: () => {},
  },
};

export const Error: Story = {
  args: {
    id: "2",
    variant: "error",
    message: "Failed to save changes. Please try again.",
    onDismiss: () => {},
  },
};

export const Warning: Story = {
  args: {
    id: "3",
    variant: "warning",
    message: "Your session will expire in 5 minutes.",
    onDismiss: () => {},
  },
};

export const Info: Story = {
  args: {
    id: "4",
    variant: "info",
    message: "A new version is available.",
    onDismiss: () => {},
  },
};

export const LongMessage: Story = {
  args: {
    id: "5",
    variant: "info",
    message:
      "This is a longer toast message that might wrap to multiple lines depending on the container width.",
    onDismiss: () => {},
  },
};

export const WithDismissing: Story = {
  args: {
    id: "6",
    variant: "success",
    message: "Dismissing...",
    isDismissing: true,
    onDismiss: () => {},
  },
};

// ============================================
// All Variants
// ============================================

export const AllVariants: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <ToastItem id="1" variant="success" message="Success message" onDismiss={() => {}} />
      <ToastItem id="2" variant="error" message="Error message" onDismiss={() => {}} />
      <ToastItem id="3" variant="warning" message="Warning message" onDismiss={() => {}} />
      <ToastItem id="4" variant="info" message="Info message" onDismiss={() => {}} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All toast variants.",
      },
    },
  },
};

// ============================================
// ToastContainer Stories
// ============================================

export const Container: StoryObj = {
  render: () => {
    // Note: This is a demo that requires interactivity
    return (
      <div style={{ padding: "20px" }}>
        <p style={{ marginBottom: "16px" }}>
          Click the buttons to trigger toasts. Toasts appear in the container.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => useToastStore.getState().success("Action completed!")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#22c55e",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Success Toast
          </button>
          <button
            onClick={() => useToastStore.getState().error("Something went wrong!")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Error Toast
          </button>
          <button
            onClick={() => useToastStore.getState().warning("Please review your input.")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#f59e0b",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Warning Toast
          </button>
          <button
            onClick={() => useToastStore.getState().info("New update available.")}
            style={{
              padding: "8px 16px",
              backgroundColor: "#3b82f6",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            Info Toast
          </button>
        </div>
        <ToastContainer />
      </div>
    );
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: "Interactive demo of toast container with queue management.",
      },
    },
  },
};

// ============================================
// Position Demo
// ============================================

export const Positions: StoryObj = {
  render: () => {
    return (
      <div style={{ padding: "20px" }}>
        <p style={{ marginBottom: "16px" }}>
          Click to change toast position, then trigger a toast.
        </p>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
          <button
            onClick={() => useToastStore.getState().setPosition("top-right")}
            style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: "6px" }}
          >
            Top Right
          </button>
          <button
            onClick={() => useToastStore.getState().setPosition("top-left")}
            style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: "6px" }}
          >
            Top Left
          </button>
          <button
            onClick={() => useToastStore.getState().setPosition("bottom-right")}
            style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: "6px" }}
          >
            Bottom Right
          </button>
          <button
            onClick={() => useToastStore.getState().setPosition("bottom-left")}
            style={{ padding: "8px 16px", border: "1px solid #ccc", borderRadius: "6px" }}
          >
            Bottom Left
          </button>
        </div>
        <button
          onClick={() => useToastStore.getState().info("Toast position demo")}
          style={{
            padding: "8px 16px",
            backgroundColor: "#1c1917",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
          }}
        >
          Show Toast
        </button>
        <ToastContainer />
      </div>
    );
  },
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        story: "Demo of different toast positions.",
      },
    },
  },
};
