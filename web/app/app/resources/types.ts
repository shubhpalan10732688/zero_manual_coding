export interface ResourceFormState {
  error?: string;
  field?: string;
  /** Title of what was just added, so the form can confirm it without a page change. */
  added?: string;
}
