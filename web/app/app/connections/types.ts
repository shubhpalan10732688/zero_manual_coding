export interface ConnectFormState {
  error?: string;
  field?: string;
  /** Who the provider said the credential belongs to, echoed back as confirmation. */
  connected?: string;
}
