export const PASSAGE_COLOR_COUNT = 8;

export const getPassageColorIndex = (key: string) => {
  const value = key.trim() || "passage";
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash % PASSAGE_COLOR_COUNT;
};

export const getAssignmentColorKey = (assignment: {
  id?: string;
  bookName: string;
  level: number;
  passageTitle: string;
}) => assignment.id || `${assignment.bookName}|${assignment.level}|${assignment.passageTitle}`;

export const getPassageColorClass = (key: string) =>
  `passage-color-${getPassageColorIndex(key)}`;
