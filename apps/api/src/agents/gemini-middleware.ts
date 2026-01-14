/**
 * Gemini 3 Thought Signature Middleware
 *
 * Gemini 3 requires thought signatures to be preserved during multi-turn tool calling.
 * The AI SDK/Mastra currently doesn't handle this correctly, causing 400 errors.
 *
 * This middleware injects a bypass signature into *tool-call* prompt parts to skip
 * validation when the real signature isn't being circulated back correctly.
 * While Google advises against this for production, it's a necessary workaround until
 * the AI SDK properly handles thought signature circulation.
 *
 * @see https://ai.google.dev/gemini-api/docs/thought-signatures
 * @see https://github.com/vercel/ai/issues/11413
 */

import type {
  LanguageModelV3CallOptions,
  LanguageModelV3Middleware,
  LanguageModelV3Prompt,
} from "@ai-sdk/provider";

/**
 * Bypass value that skips Gemini 3 thought signature validation.
 * This is documented by Google as a valid workaround for cases where
 * signature circulation cannot be properly implemented.
 */
const BYPASS_SIGNATURE = "skip_thought_signature_validator";

/**
 * Middleware that injects a bypass thought signature into tool-call prompt parts.
 * This allows Gemini 3 to process multi-turn tool calling without 400 errors
 * even when upstream doesn't preserve thought signatures correctly yet.
 */
export const geminiThoughtSignatureMiddleware: LanguageModelV3Middleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    // Inject bypass signatures into assistant tool-call parts when missing.
    const transformedPrompt: LanguageModelV3Prompt = params.prompt.map((message) => {
      if (message.role !== "assistant") {
        return message;
      }

      return {
        ...message,
        content: message.content.map((part) => {
          if (part.type !== "tool-call") {
            return part;
          }

          // If upstream already provided a real signature, preserve it.
          const existingSignature =
            typeof part.providerOptions?.google === "object" &&
            part.providerOptions?.google !== null &&
            "thoughtSignature" in part.providerOptions.google
              ? (part.providerOptions.google as { thoughtSignature?: unknown }).thoughtSignature
              : undefined;

          if (typeof existingSignature === "string" && existingSignature.length > 0) {
            return part;
          }

          return {
            ...part,
            providerOptions: {
              ...part.providerOptions,
              google: {
                ...(part.providerOptions?.google ?? {}),
                thoughtSignature: BYPASS_SIGNATURE,
              },
            },
          };
        }),
      };
    });

    return {
      ...params,
      prompt: transformedPrompt,
    } satisfies LanguageModelV3CallOptions;
  },
};
