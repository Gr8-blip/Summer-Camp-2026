// Single source of truth for every activity type. Every builder
// component reads from this instead of hard-coding labels/colors, so
// adding a new type only means editing this file (+ registering its
// editor in QuestionEditorPanel and its preview in StudentPreview).

export const ACTIVITY_TYPES = [
  {
    type: "multiple_choice",
    label: "Multiple Choice",
    icon: "🎯",
    tint: "var(--cb-mc)",
    blurb: "Pick the one right answer from four options.",
  },
  {
    type: "true_false",
    label: "True / False",
    icon: "⚖️",
    tint: "var(--cb-tf)",
    blurb: "A quick call — true or false.",
  },
  {
    type: "drag_order",
    label: "Drag & Drop",
    icon: "🧩",
    tint: "var(--cb-drag)",
    blurb: "Arrange cards into the correct order.",
  },
  {
    type: "match_pairs",
    label: "Match Pairs",
    icon: "🔗",
    tint: "var(--cb-match)",
    blurb: "Connect items from two columns.",
  },
  {
    type: "fill_blank",
    label: "Fill in the Blank",
    icon: "✏️",
    tint: "var(--cb-fill)",
    blurb: "Type the missing word or phrase.",
  },
  {
    type: "prompt_build",
    label: "Prompt Challenge",
    icon: "🤖",
    tint: "var(--cb-prompt)",
    blurb: "Write a prompt that gets the job done.",
  },
  {
    type: "memory_tiles",
    label: "Memory Tiles",
    icon: "🧠",
    tint: "var(--cb-memory)",
    blurb: "Flip cards to find matching pairs.",
  },
  {
    type: "word_search",
    label: "Word Search",
    icon: "🔍",
    tint: "var(--cb-search)",
    blurb: "Find hidden words in a letter grid.",
  },
  {
    type: "image_reveal",
    label: "Image Reveal",
    icon: "🖼️",
    tint: "var(--cb-reveal)",
    blurb: "Guess the answer as the image comes into focus.",
  },
];

export const activityMeta = (type) =>
  ACTIVITY_TYPES.find((a) => a.type === type) || ACTIVITY_TYPES[0];

export function blankContent(type) {
  switch (type) {
    case "multiple_choice":
      return { question: "", options: ["", "", "", ""], answer: 0 };
    case "true_false":
      return { question: "", answer: true };
    case "drag_order":
      return { question: "", items: [] };
    case "match_pairs":
      return { question: "", pairs: {} };
    case "fill_blank":
      return { question: "", answer: "" };
    case "prompt_build":
      return { task: "", answer: "" };
    case "memory_tiles":
      return { question: "", pairs: [] };
    case "word_search":
      return { question: "", words: [] };
    case "image_reveal":
      return { image: "", question: "", answer: "" };
    default:
      return {};
  }
}
