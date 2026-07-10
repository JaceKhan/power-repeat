export type PrepSegment = {
  id: string;
  text: string;
};

export const TARGET_PREP_SEGMENT_LENGTH = 150;
export const MAX_PREP_SEGMENTS = 15;

const COMMON_ABBREVIATIONS = new Set([
  "mr",
  "mrs",
  "ms",
  "dr",
  "prof",
  "sr",
  "jr",
  "vs",
  "etc",
  "st",
  "mt",
  "ft",
  "dept",
  "est",
  "approx"
]);

const splitPassageIntoSentences = (passage: string): string[] => {
  const sentences: string[] = [];
  let current = "";

  for (let index = 0; index < passage.length; index += 1) {
    const character = passage[index];
    current += character;

    if (character !== "." && character !== "!" && character !== "?") {
      continue;
    }

    const trimmed = current.trim();
    if (trimmed.match(/\b[A-Za-z]\.$/)) {
      continue;
    }

    const abbreviationMatch = trimmed.match(/\b([A-Za-z]+)\.$/);
    if (abbreviationMatch && COMMON_ABBREVIATIONS.has(abbreviationMatch[1].toLowerCase())) {
      continue;
    }

    let nextIndex = index + 1;
    while (nextIndex < passage.length && passage[nextIndex] === " ") {
      nextIndex += 1;
    }

    const nextCharacter = passage[nextIndex];
    const isBoundary =
      nextIndex >= passage.length || /[A-Z"'“‘(]/.test(nextCharacter ?? "");

    if (!isBoundary) {
      continue;
    }

    sentences.push(trimmed);
    current = "";
    index = nextIndex - 1;
  }

  if (current.trim()) {
    sentences.push(current.trim());
  }

  return sentences.length > 0 ? sentences : [passage];
};

const splitLongSentenceIntoUnits = (sentence: string, maxLength: number): string[] => {
  if (sentence.length <= maxLength) {
    return [sentence];
  }

  const clausePieces = sentence
    .split(/(?<=[,:;])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const units: string[] = [];
  let current = "";

  const pushCurrent = () => {
    if (current) {
      units.push(current);
      current = "";
    }
  };

  clausePieces.forEach((piece) => {
    if (piece.length > maxLength) {
      pushCurrent();
      const words = piece.split(" ").filter(Boolean);
      let wordChunk = "";
      words.forEach((word) => {
        const next = wordChunk ? `${wordChunk} ${word}` : word;
        if (wordChunk && next.length > maxLength) {
          units.push(wordChunk);
          wordChunk = word;
        } else {
          wordChunk = next;
        }
      });
      if (wordChunk) {
        units.push(wordChunk);
      }
      return;
    }

    const next = current ? `${current} ${piece}` : piece;
    if (current && next.length > maxLength) {
      pushCurrent();
      current = piece;
    } else {
      current = next;
    }
  });

  pushCurrent();
  return units.length > 0 ? units : [sentence];
};

export const splitPassageIntoPrepSegments = (passage: string): PrepSegment[] => {
  const normalizedPassage = passage.replace(/\s+/g, " ").trim();
  if (!normalizedPassage) {
    return [];
  }

  const sentences = splitPassageIntoSentences(normalizedPassage);
  const totalLength = normalizedPassage.length;
  const segmentCount = Math.min(
    MAX_PREP_SEGMENTS,
    Math.max(1, Math.ceil(totalLength / TARGET_PREP_SEGMENT_LENGTH)),
    Math.max(1, sentences.length)
  );
  const softMaxLength = Math.max(
    TARGET_PREP_SEGMENT_LENGTH,
    Math.ceil(totalLength / segmentCount) + 40
  );

  const units = sentences.flatMap((sentence) => splitLongSentenceIntoUnits(sentence, softMaxLength));
  const segments: string[] = [];
  let unitIndex = 0;

  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const remainingSegments = segmentCount - segmentIndex;
    const remainingUnits = units.slice(unitIndex);
    if (remainingSegments === 1) {
      segments.push(remainingUnits.join(" "));
      break;
    }

    const targetLength = Math.round(remainingUnits.join(" ").length / remainingSegments);
    const parts: string[] = [];
    let segmentLength = 0;

    while (unitIndex < units.length) {
      const unitsAfterTake = units.length - unitIndex - 1;
      const segmentsAfter = remainingSegments - 1;
      if (parts.length > 0 && unitsAfterTake < segmentsAfter) {
        break;
      }

      const unit = units[unitIndex];
      const nextLength = segmentLength === 0 ? unit.length : segmentLength + 1 + unit.length;

      if (parts.length > 0 && segmentLength >= targetLength && unitsAfterTake >= segmentsAfter) {
        break;
      }

      if (parts.length > 0 && nextLength > targetLength && unitsAfterTake >= segmentsAfter) {
        const overshoot = nextLength - targetLength;
        const undershoot = targetLength - segmentLength;
        if (overshoot >= undershoot) {
          break;
        }
      }

      parts.push(unit);
      segmentLength = nextLength;
      unitIndex += 1;

      if (segmentLength >= targetLength && units.length - unitIndex >= segmentsAfter) {
        break;
      }
    }

    if (parts.length === 0 && unitIndex < units.length) {
      parts.push(units[unitIndex]);
      unitIndex += 1;
    }

    segments.push(parts.join(" "));
  }

  return segments.map((text, index) => ({
    id: `segment-${index}`,
    text
  }));
};
