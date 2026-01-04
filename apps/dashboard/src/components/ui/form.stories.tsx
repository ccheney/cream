/**
 * Form Stories
 *
 * Storybook stories for form validation components.
 *
 * @see docs/plans/ui/28-states.md lines 76-82
 */

import type { Meta, StoryObj } from "@storybook/react";
import {
  Form,
  FormError,
  FormField,
  FormGroup,
  FormHint,
  FormInput,
  FormLabel,
  FormSelect,
  FormTextarea,
} from "./form";

// ============================================
// FormField Stories
// ============================================

const meta: Meta<typeof FormField> = {
  title: "UI/Forms/FormField",
  component: FormField,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component: "Form field wrapper with label, input, hint, and error display.",
      },
    },
  },
  tags: ["autodocs"],
};

export default meta;

type Story = StoryObj<typeof FormField>;

// ============================================
// Basic Fields
// ============================================

export const Default: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="email">Email</FormLabel>
      <FormInput id="email" type="email" placeholder="you@example.com" />
    </FormField>
  ),
};

export const WithHint: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="password">Password</FormLabel>
      <FormInput id="password" type="password" placeholder="••••••••" />
      <FormHint>Must be at least 8 characters</FormHint>
    </FormField>
  ),
};

export const WithError: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="email">Email</FormLabel>
      <FormInput id="email" type="email" placeholder="you@example.com" hasError />
      <FormError>Invalid email address</FormError>
    </FormField>
  ),
};

export const Required: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="name" required>
        Full Name
      </FormLabel>
      <FormInput id="name" type="text" placeholder="John Doe" />
    </FormField>
  ),
};

// ============================================
// Input Types
// ============================================

export const TextInput: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="text">Text Input</FormLabel>
      <FormInput id="text" type="text" placeholder="Enter text" />
    </FormField>
  ),
};

export const EmailInput: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="email">Email Input</FormLabel>
      <FormInput id="email" type="email" placeholder="email@example.com" />
    </FormField>
  ),
};

export const PasswordInput: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="password">Password Input</FormLabel>
      <FormInput id="password" type="password" placeholder="••••••••" />
    </FormField>
  ),
};

export const NumberInput: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="amount">Amount</FormLabel>
      <FormInput id="amount" type="number" placeholder="0.00" />
    </FormField>
  ),
};

// ============================================
// Textarea
// ============================================

export const Textarea: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="bio">Bio</FormLabel>
      <FormTextarea id="bio" placeholder="Tell us about yourself..." rows={4} />
      <FormHint>Max 500 characters</FormHint>
    </FormField>
  ),
};

export const TextareaWithError: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="bio">Bio</FormLabel>
      <FormTextarea id="bio" placeholder="Tell us about yourself..." rows={4} hasError />
      <FormError>Bio is required</FormError>
    </FormField>
  ),
};

// ============================================
// Select
// ============================================

export const Select: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="country">Country</FormLabel>
      <FormSelect id="country">
        <option value="">Select a country</option>
        <option value="us">United States</option>
        <option value="uk">United Kingdom</option>
        <option value="ca">Canada</option>
      </FormSelect>
    </FormField>
  ),
};

export const SelectWithError: Story = {
  render: () => (
    <FormField>
      <FormLabel htmlFor="country">Country</FormLabel>
      <FormSelect id="country" hasError>
        <option value="">Select a country</option>
      </FormSelect>
      <FormError>Please select a country</FormError>
    </FormField>
  ),
};

// ============================================
// Form Group
// ============================================

export const HorizontalGroup: Story = {
  render: () => (
    <FormGroup direction="horizontal">
      <FormField>
        <FormLabel htmlFor="firstName">First Name</FormLabel>
        <FormInput id="firstName" placeholder="John" />
      </FormField>
      <FormField>
        <FormLabel htmlFor="lastName">Last Name</FormLabel>
        <FormInput id="lastName" placeholder="Doe" />
      </FormField>
    </FormGroup>
  ),
};

export const VerticalGroup: Story = {
  render: () => (
    <FormGroup direction="vertical">
      <FormField>
        <FormLabel htmlFor="email">Email</FormLabel>
        <FormInput id="email" type="email" placeholder="email@example.com" />
      </FormField>
      <FormField>
        <FormLabel htmlFor="password">Password</FormLabel>
        <FormInput id="password" type="password" placeholder="••••••••" />
      </FormField>
    </FormGroup>
  ),
};

// ============================================
// Complete Form Example
// ============================================

export const CompleteForm: StoryObj = {
  render: () => (
    <Form style={{ width: "400px" }}>
      <FormGroup direction="horizontal">
        <FormField>
          <FormLabel htmlFor="firstName" required>
            First Name
          </FormLabel>
          <FormInput id="firstName" placeholder="John" />
        </FormField>
        <FormField>
          <FormLabel htmlFor="lastName" required>
            Last Name
          </FormLabel>
          <FormInput id="lastName" placeholder="Doe" />
        </FormField>
      </FormGroup>

      <FormField>
        <FormLabel htmlFor="email" required>
          Email
        </FormLabel>
        <FormInput id="email" type="email" placeholder="john@example.com" />
        <FormHint>We'll never share your email</FormHint>
      </FormField>

      <FormField>
        <FormLabel htmlFor="password" required>
          Password
        </FormLabel>
        <FormInput id="password" type="password" placeholder="••••••••" hasError />
        <FormError>Password must be at least 8 characters</FormError>
      </FormField>

      <FormField>
        <FormLabel htmlFor="bio">Bio</FormLabel>
        <FormTextarea id="bio" placeholder="Tell us about yourself..." rows={3} />
      </FormField>

      <FormField>
        <FormLabel htmlFor="country">Country</FormLabel>
        <FormSelect id="country">
          <option value="">Select a country</option>
          <option value="us">United States</option>
          <option value="uk">United Kingdom</option>
        </FormSelect>
      </FormField>
    </Form>
  ),
  parameters: {
    layout: "padded",
    docs: {
      description: {
        story: "Complete form example with various field types.",
      },
    },
  },
};

// ============================================
// Validation States
// ============================================

export const ValidationStates: StoryObj = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", width: "300px" }}>
      <FormField>
        <FormLabel htmlFor="valid">Valid Field</FormLabel>
        <FormInput id="valid" value="john@example.com" readOnly />
        <FormHint>This field is valid</FormHint>
      </FormField>

      <FormField>
        <FormLabel htmlFor="invalid">Invalid Field</FormLabel>
        <FormInput id="invalid" value="invalid-email" hasError readOnly />
        <FormError>Please enter a valid email address</FormError>
      </FormField>

      <FormField>
        <FormLabel htmlFor="disabled">Disabled Field</FormLabel>
        <FormInput id="disabled" value="Disabled input" disabled />
      </FormField>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Different validation states.",
      },
    },
  },
};
