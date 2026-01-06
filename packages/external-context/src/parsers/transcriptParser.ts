/**
 * Transcript Parser
 *
 * Parses FMP earnings call transcript API responses into normalized format.
 */

import type { FMPTranscript, ParsedTranscript, TranscriptSpeaker } from "../types.js";

/**
 * Transcript parser configuration
 */
export interface TranscriptParserConfig {
  /** Maximum total content length (default: 50000) */
  maxContentLength?: number;
  /** Minimum speaker segment length to include (default: 20) */
  minSegmentLength?: number;
}

const DEFAULT_CONFIG: Required<TranscriptParserConfig> = {
  maxContentLength: 50000,
  minSegmentLength: 20,
};

/**
 * Parse FMP transcript into normalized format
 */
export function parseTranscript(
  transcript: FMPTranscript,
  config: TranscriptParserConfig = {}
): ParsedTranscript | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  if (!transcript.content || !transcript.symbol) {
    return null;
  }

  const date = parseDate(transcript.date);
  if (!date) {
    return null;
  }

  // Parse content into speaker segments
  const speakers = parseTranscriptContent(transcript.content, cfg);

  // Convert quarter number to string format
  const quarter = `Q${transcript.quarter}`;

  return {
    speakers,
    quarter,
    year: transcript.year,
    symbol: transcript.symbol.toUpperCase(),
    date,
  };
}

/**
 * Parse transcript content into speaker segments
 *
 * FMP transcripts typically have format:
 * "Speaker Name: Text content..."
 * or structured sections
 */
function parseTranscriptContent(
  content: string,
  config: Required<TranscriptParserConfig>
): TranscriptSpeaker[] {
  const speakers: TranscriptSpeaker[] = [];

  // Truncate if too long
  let processedContent = content;
  if (processedContent.length > config.maxContentLength) {
    processedContent = processedContent.slice(0, config.maxContentLength);
  }

  // Split by common speaker patterns
  // Pattern 1: "Name -- Title: Text"
  // Pattern 2: "Name: Text"
  // Pattern 3: Line breaks with speaker attribution

  const lines = processedContent.split(/\n+/);
  let currentSpeaker: { speaker: string; role?: string; text: string[] } | null = null;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    // Try to match speaker pattern with role
    const speakerWithRole = trimmedLine.match(/^([A-Z][A-Za-z\s.]+)\s*--\s*([^:]+):\s*(.*)$/);
    if (speakerWithRole?.[1] && speakerWithRole[2]) {
      // Save previous speaker
      if (currentSpeaker && currentSpeaker.text.length > 0) {
        speakers.push(finalizeSpeaker(currentSpeaker, config));
      }
      currentSpeaker = {
        speaker: speakerWithRole[1].trim(),
        role: speakerWithRole[2].trim(),
        text: speakerWithRole[3] ? [speakerWithRole[3].trim()] : [],
      };
      continue;
    }

    // Try to match simple speaker pattern
    const simpleSpeaker = trimmedLine.match(/^([A-Z][A-Za-z\s.]+):\s*(.*)$/);
    if (simpleSpeaker?.[1] && simpleSpeaker[1].length < 50) {
      // Save previous speaker
      if (currentSpeaker && currentSpeaker.text.length > 0) {
        speakers.push(finalizeSpeaker(currentSpeaker, config));
      }
      currentSpeaker = {
        speaker: simpleSpeaker[1].trim(),
        text: simpleSpeaker[2] ? [simpleSpeaker[2].trim()] : [],
      };
      continue;
    }

    // Continuation of previous speaker
    if (currentSpeaker) {
      currentSpeaker.text.push(trimmedLine);
    } else {
      // No speaker yet, start with "Unknown"
      currentSpeaker = {
        speaker: "Unknown",
        text: [trimmedLine],
      };
    }
  }

  // Save last speaker
  if (currentSpeaker && currentSpeaker.text.length > 0) {
    speakers.push(finalizeSpeaker(currentSpeaker, config));
  }

  return speakers;
}

/**
 * Finalize a speaker segment
 */
function finalizeSpeaker(
  speaker: { speaker: string; role?: string; text: string[] },
  config: Required<TranscriptParserConfig>
): TranscriptSpeaker {
  const text = speaker.text.join(" ").trim();

  return {
    speaker: speaker.speaker,
    role: speaker.role,
    text: text.length > config.minSegmentLength ? text : "",
  };
}

/**
 * Parse date string
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr) {
    return null;
  }
  const date = new Date(dateStr);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Extract key sections from transcript (intro, Q&A, etc.)
 */
export function extractTranscriptSections(transcript: ParsedTranscript): {
  prepared: TranscriptSpeaker[];
  qa: TranscriptSpeaker[];
} {
  const speakers = transcript.speakers;

  // Find Q&A section start (usually marked by "Operator" or "Question")
  let qaStart = speakers.findIndex(
    (s) => s.speaker.toLowerCase().includes("operator") && s.text.toLowerCase().includes("question")
  );

  if (qaStart === -1) {
    // Alternative: look for "Questions and Answers" or "Q&A"
    qaStart = speakers.findIndex(
      (s) =>
        s.text.toLowerCase().includes("questions and answers") ||
        s.text.toLowerCase().includes("q&a session")
    );
  }

  if (qaStart === -1 || qaStart === 0) {
    // No clear Q&A section found
    return { prepared: speakers, qa: [] };
  }

  return {
    prepared: speakers.slice(0, qaStart),
    qa: speakers.slice(qaStart),
  };
}

/**
 * Get executive comments from transcript
 */
export function getExecutiveComments(transcript: ParsedTranscript): TranscriptSpeaker[] {
  const executiveRoles = ["ceo", "cfo", "coo", "president", "chief"];
  return transcript.speakers.filter(
    (s) => s.role && executiveRoles.some((role) => s.role?.toLowerCase().includes(role))
  );
}
