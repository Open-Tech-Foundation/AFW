// A small JS/JSX highlighter for the fixed code samples on the home page. MDX code
// fences are highlighted at build time; these samples live in JSX, so they get this
// instead: one regex pass into `{ text, kind }` tokens, the same on server and client.

const TOKEN = new RegExp(
  [
    String.raw`(?<comment>\/\/[^\n]*)`,
    String.raw`(?<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\`(?:\\.|[^\`\\])*\`)`,
    String.raw`(?<tag></?[A-Za-z][\w.]*|/?>)`,
    String.raw`(?<keyword>\b(?:import|from|export|default|function|const|let|return|async|await|if|else|new)\b)`,
    String.raw`(?<macro>\$[A-Za-z]\w*)`,
    String.raw`(?<number>\b\d+\b)`,
    String.raw`(?<call>\b[A-Za-z_]\w*(?=\())`,
  ].join("|"),
  "g",
);

/** `code` as tokens; `kind` is "" for plain text. */
export function highlight(code) {
  const tokens = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    if (match.index > last) tokens.push({ text: code.slice(last, match.index), kind: "" });
    const kind = Object.keys(match.groups).find((name) => match.groups[name] !== undefined);
    tokens.push({ text: match[0], kind });
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last), kind: "" });
  return tokens;
}
