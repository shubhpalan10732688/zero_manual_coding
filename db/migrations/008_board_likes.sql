-- Reactions become likes.
--
-- The board shipped with four emoji per post. Nobody asked what the difference between 🔥
-- and 👏 meant, which is the tell: a reaction set that needs explaining is a reaction set
-- that gets ignored, and the counts it produced could not be summed into anything. One like
-- can be, and "twelve people found this useful" is a sentence the board can actually say.
--
-- The column stays, and stays keyed, so a future set of reactions does not need a migration
-- to add back. What changes is that the app only ever writes one value into it.
--
-- Existing reactions are kept rather than discarded: somebody meant them, and dropping them
-- would silently deflate every count on the wall. Anyone who reacted twice to the same post
-- loses the duplicate, since two emoji from one person is still one like.

DELETE FROM achievement_reaction a
 WHERE a.emoji <> '👍'
   AND EXISTS (
     SELECT 1 FROM achievement_reaction b
      WHERE b.achievement_id = a.achievement_id
        AND b.email = a.email
        AND b.emoji = '👍'
   );

UPDATE achievement_reaction SET emoji = '👍' WHERE emoji <> '👍';
