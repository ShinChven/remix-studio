/**
 * The newer Gemini 3.x and 4 models are tuned for their default sampling and reject
 * the legacy knobs (`temperature`, `topP`, `topK`) instead of ignoring them, so
 * those fields have to be left out of the request entirely.
 *
 * Kept in one place so the assistant chat adapter and the text generators agree
 * on which models still accept them.
 */
const MODELS_WITHOUT_SAMPLING_PARAMETERS = new Set([
  'gemini-4-carbon',
  'gemini-4-argon',
  'gemini-4-hydrogen',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
]);

export function geminiSupportsSamplingParameters(modelId: string): boolean {
  return !MODELS_WITHOUT_SAMPLING_PARAMETERS.has(modelId);
}
