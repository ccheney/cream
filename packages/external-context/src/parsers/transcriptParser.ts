/**
 * Transcript Parser
 *
 * Parses earnings call transcripts into normalized format.
 */

import type { ParsedTranscript, TranscriptInput, TranscriptSpeaker } from "../types.js";

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

const SPEAKER_WITH_ROLE_PATTERN = /^([A-Z][A-Za-z\s.]+)\s*--\s*([^:]+):\s*(.*)$/;
const SIMPLE_SPEAKER_PATTERN = /^([A-Z][A-Za-z\s.]+):\s*(.*)$/;

type SpeakerDraft = { speaker: string; role?: string; text: string[] };

/**
 * Parse transcript into normalized format
 */
export function parseTranscript(
	transcript: TranscriptInput,
	config: TranscriptParserConfig = {},
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
 * Transcripts typically have format:
 * "Speaker Name: Text content..."
 * or structured sections
 */
function parseTranscriptContent(
	content: string,
	config: Required<TranscriptParserConfig>,
): TranscriptSpeaker[] {
	const speakers: TranscriptSpeaker[] = [];
	const lines = truncateTranscriptContent(content, config.maxContentLength).split(/\n+/);
	let currentSpeaker: SpeakerDraft | null = null;

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (!trimmedLine) {
			continue;
		}

		const speakerFromLine = parseSpeakerLine(trimmedLine);
		if (speakerFromLine) {
			pushSpeakerSegment(speakers, currentSpeaker, config);
			currentSpeaker = speakerFromLine;
			continue;
		}

		currentSpeaker = appendToSpeakerSegment(currentSpeaker, trimmedLine);
	}

	pushSpeakerSegment(speakers, currentSpeaker, config);

	return speakers;
}

function truncateTranscriptContent(content: string, maxLength: number): string {
	if (content.length > maxLength) {
		return content.slice(0, maxLength);
	}

	return content;
}

function parseSpeakerLine(line: string): SpeakerDraft | null {
	const speakerWithRole = line.match(SPEAKER_WITH_ROLE_PATTERN);
	if (speakerWithRole?.[1] && speakerWithRole[2]) {
		return {
			speaker: speakerWithRole[1].trim(),
			role: speakerWithRole[2].trim(),
			text: speakerWithRole[3] ? [speakerWithRole[3].trim()] : [],
		};
	}

	const simpleSpeaker = line.match(SIMPLE_SPEAKER_PATTERN);
	if (simpleSpeaker?.[1] && simpleSpeaker[1].length < 50) {
		return {
			speaker: simpleSpeaker[1].trim(),
			text: simpleSpeaker[2] ? [simpleSpeaker[2].trim()] : [],
		};
	}

	return null;
}

function appendToSpeakerSegment(currentSpeaker: SpeakerDraft | null, line: string): SpeakerDraft {
	if (!currentSpeaker) {
		return {
			speaker: "Unknown",
			text: [line],
		};
	}

	currentSpeaker.text.push(line);
	return currentSpeaker;
}

function pushSpeakerSegment(
	speakers: TranscriptSpeaker[],
	speaker: SpeakerDraft | null,
	config: Required<TranscriptParserConfig>,
): void {
	if (speaker && speaker.text.length > 0) {
		speakers.push(finalizeSpeaker(speaker, config));
	}
}

/**
 * Finalize a speaker segment
 */
function finalizeSpeaker(
	speaker: SpeakerDraft,
	config: Required<TranscriptParserConfig>,
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
		(s) =>
			s.speaker.toLowerCase().includes("operator") && s.text.toLowerCase().includes("question"),
	);

	if (qaStart === -1) {
		// Alternative: look for "Questions and Answers" or "Q&A"
		qaStart = speakers.findIndex(
			(s) =>
				s.text.toLowerCase().includes("questions and answers") ||
				s.text.toLowerCase().includes("q&a session"),
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
		(s) => s.role && executiveRoles.some((role) => s.role?.toLowerCase().includes(role)),
	);
}
