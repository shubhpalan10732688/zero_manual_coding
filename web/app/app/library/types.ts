/**
 * Shared between the authoring form and the server action behind it, which cannot export
 * types of its own.
 */

export interface AssetFormState {
  error?: string;
  field?: string;
}
