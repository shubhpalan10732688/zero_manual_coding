/**
 * Shapes shared between the board's form and its server action. They live here rather than
 * beside the action because a 'use server' module is only allowed to export functions.
 */

export interface BoardFormState {
  error?: string;
  /** Which field to mark invalid, so the message points at the box it is about. */
  field?: string;
}

/**
 * The only value ever written to achievement_reaction.emoji.
 *
 * The column is still an emoji column so a richer reaction set can return without a schema
 * change, but the product has exactly one reaction and the count on a card means exactly one
 * thing. See migration 008.
 */
export const LIKE_EMOJI = '👍';
