/**
 * Helpers to build PostgREST filter expressions from untrusted text.
 *
 * PostgREST `.or()` takes a filter *expression*, so raw user text can change
 * the meaning of the query. We strip the characters that carry syntax meaning
 * and wrap the value in double quotes so it is always treated as a literal.
 */
export function sanitizeFilterTerm(input: string, maxLength = 120): string {
  return input
    .replace(/[,()."'\\*:%\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/** Builds a quoted `ilike` pattern safe for use inside `.or()` / `.ilike()`. */
export function ilikePattern(input: string, maxLength = 120): string {
  return `"%${sanitizeFilterTerm(input, maxLength)}%"`;
}

/** Builds a safe `column.ilike."%term%",column2.ilike."%term%"` expression. */
export function ilikeOrExpression(columns: string[], input: string, maxLength = 120): string {
  const pattern = ilikePattern(input, maxLength);
  return columns.map((c) => `${c}.ilike.${pattern}`).join(",");
}
