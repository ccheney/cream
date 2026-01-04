/**
 * Success Feedback Stories
 *
 * Storybook stories for success feedback components.
 *
 * @see docs/plans/ui/28-states.md lines 110-114
 */

import type { Meta, StoryObj } from "@storybook/react";
import React, { useState } from "react";
import {
  Checkmark,
  SuccessText,
  SuccessButton,
  InlineSuccess,
  useAsyncButton,
} from "./success-feedback";
import type { ButtonState } from "./success-feedback";

// ============================================
// Checkmark Stories
// ============================================

const checkmarkMeta: Meta<typeof Checkmark> = {
  title: "UI/Feedback/Success/Checkmark",
  component: Checkmark,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Animated SVG checkmark with stroke-dashoffset draw animation.",
      },
    },
  },
  tags: ["autodocs"],
  argTypes: {
    size: {
      control: { type: "number", min: 12, max: 64 },
      description: "Size in pixels",
    },
    color: {
      control: "color",
      description: "Stroke color",
    },
    duration: {
      control: { type: "number", min: 100, max: 1000 },
      description: "Animation duration in ms",
    },
    animated: {
      control: "boolean",
      description: "Enable animation",
    },
  },
};

export default checkmarkMeta;

type CheckmarkStory = StoryObj<typeof Checkmark>;

export const Default: CheckmarkStory = {
  args: {
    size: 24,
    animated: true,
  },
};

export const Large: CheckmarkStory = {
  args: {
    size: 48,
    animated: true,
  },
};

export const CustomColor: CheckmarkStory = {
  args: {
    size: 32,
    color: "#3b82f6",
    animated: true,
  },
};

export const NoAnimation: CheckmarkStory = {
  args: {
    size: 24,
    animated: false,
  },
};

export const SlowAnimation: CheckmarkStory = {
  args: {
    size: 32,
    duration: 800,
    animated: true,
  },
};

export const Sizes: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
      <Checkmark size={16} />
      <Checkmark size={24} />
      <Checkmark size={32} />
      <Checkmark size={48} />
    </div>
  ),
};

// ============================================
// SuccessText Stories
// ============================================

export const TextDefault: StoryObj<typeof SuccessText> = {
  render: (args) => <SuccessText {...args} />,
  args: {
    children: "Saved!",
  },
  parameters: {
    docs: {
      description: {
        story: "Success text with animated checkmark.",
      },
    },
  },
};

export const TextCustom: StoryObj<typeof SuccessText> = {
  render: (args) => <SuccessText {...args} />,
  args: {
    children: "Changes applied successfully!",
  },
};

// ============================================
// InlineSuccess Stories
// ============================================

export const InlineDefault: StoryObj<typeof InlineSuccess> = {
  render: (args) => <InlineSuccess {...args} />,
  args: {
    text: "Saved",
  },
  parameters: {
    docs: {
      description: {
        story: "Inline success indicator for forms.",
      },
    },
  },
};

export const InlineCustomText: StoryObj<typeof InlineSuccess> = {
  render: (args) => <InlineSuccess {...args} />,
  args: {
    text: "Settings updated",
  },
};

// ============================================
// SuccessButton Stories
// ============================================

export const ButtonIdle: StoryObj<typeof SuccessButton> = {
  render: (args) => <SuccessButton {...args} />,
  args: {
    state: "idle",
    children: "Save Changes",
  },
  parameters: {
    docs: {
      description: {
        story: "Button in idle state.",
      },
    },
  },
};

export const ButtonLoading: StoryObj<typeof SuccessButton> = {
  render: (args) => <SuccessButton {...args} />,
  args: {
    state: "loading",
    children: "Save Changes",
    loadingText: "Saving...",
  },
  parameters: {
    docs: {
      description: {
        story: "Button in loading state.",
      },
    },
  },
};

export const ButtonSuccess: StoryObj<typeof SuccessButton> = {
  render: (args) => <SuccessButton {...args} />,
  args: {
    state: "success",
    successText: "Saved!",
  },
  parameters: {
    docs: {
      description: {
        story: "Button in success state.",
      },
    },
  },
};

export const ButtonError: StoryObj<typeof SuccessButton> = {
  render: (args) => <SuccessButton {...args} />,
  args: {
    state: "error",
    errorText: "Failed",
  },
  parameters: {
    docs: {
      description: {
        story: "Button in error state.",
      },
    },
  },
};

export const ButtonAllStates: StoryObj = {
  render: () => (
    <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
      <SuccessButton state="idle">Idle</SuccessButton>
      <SuccessButton state="loading" loadingText="Loading...">Loading</SuccessButton>
      <SuccessButton state="success" successText="Done!">Success</SuccessButton>
      <SuccessButton state="error" errorText="Error">Error</SuccessButton>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "All button states.",
      },
    },
  },
};

// ============================================
// Interactive Demo
// ============================================

function InteractiveButtonDemo() {
  const [state, setState] = useState<ButtonState>("idle");

  const handleClick = async () => {
    setState("loading");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setState("success");
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setState("idle");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
      <SuccessButton
        state={state}
        onClick={handleClick}
        loadingText="Saving..."
        successText="Saved!"
      >
        Save Changes
      </SuccessButton>
      <p style={{ color: "#78716c", fontSize: "14px" }}>
        Current state: <strong>{state}</strong>
      </p>
    </div>
  );
}

export const Interactive: StoryObj = {
  render: () => <InteractiveButtonDemo />,
  parameters: {
    docs: {
      description: {
        story: "Interactive demo showing full state machine flow.",
      },
    },
  },
};

// ============================================
// useAsyncButton Hook Demo
// ============================================

function AsyncButtonDemo() {
  const { state, execute, reset } = useAsyncButton(async () => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (Math.random() > 0.5) {
      throw new Error("Random failure");
    }
    return "Success!";
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
      <SuccessButton
        state={state}
        onClick={execute}
        onStateReset={reset}
        loadingText="Processing..."
        successText="Done!"
        errorText="Failed"
      >
        Try Your Luck
      </SuccessButton>
      <p style={{ color: "#78716c", fontSize: "14px" }}>
        50% chance of success. State: <strong>{state}</strong>
      </p>
    </div>
  );
}

export const AsyncHook: StoryObj = {
  render: () => <AsyncButtonDemo />,
  parameters: {
    docs: {
      description: {
        story: "Demo of useAsyncButton hook with random success/failure.",
      },
    },
  },
};
