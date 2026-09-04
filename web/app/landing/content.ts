/**
 * The words on the public page.
 *
 * Kept out of the component because this is the part people will actually argue about and
 * rewrite, and it should be editable without reading JSX. Everything here is prose the
 * organisation is asserting about itself; every number on the page comes from the database
 * instead, so nothing here can quietly go stale.
 */

export interface Principle {
  icon: string;
  title: string;
  body: string;
}

export interface Step {
  title: string;
  body: string;
}

export const HERO = {
  eyebrow: 'An engineering practice, not a tool rollout',
  title: 'Zero Manual Coding',
  lede: 'What the people here have achieved by directing an AI agent instead of typing every line themselves — in their own words, with what it saved them, and with enough detail that you can do the same thing tomorrow.',
} as const;

export const WALL = {
  title: 'What people here have achieved',
  lede: 'Every card was written by the person who did the work. Some are features, some are migrations nobody noticed, and some are an afternoon of tedium that turned into twenty minutes. All of them count.',
} as const;

export const WHAT_IT_IS = {
  title: 'What Zero Manual Coding actually means',
  body: [
    'It is not a ban on typing. It is a default: before writing a change by hand, try to get there by describing it well enough that an agent can. The point of the exercise is that a task you can specify precisely is a task you understand, and the specification outlives the diff.',
    'Zero is a direction rather than a score. Some work will always be quicker by hand, and nobody is measured on how little they typed. What is worth measuring is whether the same problem gets solved faster the second time somebody meets it — which only happens if the first person wrote down how they solved it.',
  ],
} as const;

export const PRINCIPLES: Principle[] = [
  {
    icon: 'target',
    title: 'Specify, do not type',
    body: 'Spend the effort on the prompt, the context and the acceptance criteria. A vague instruction produces a plausible diff you then have to debug, which is slower than having written it yourself.',
  },
  {
    icon: 'shield',
    title: 'Review like it is a colleague',
    body: 'Agent output goes through the same review, tests and standards as anything else. Zero Manual Coding changes who writes the first draft, not who is accountable for what merges.',
  },
  {
    icon: 'terminal',
    title: 'Turn a good prompt into a shared one',
    body: 'A prompt that worked twice belongs in the shared commands and rules library, not in one person\u2019s history. That is the difference between an individual getting faster and a team getting faster.',
  },
  {
    icon: 'award',
    title: 'Write it up, honestly',
    body: 'Every card on the wall says what somebody achieved, how the agent helped, and what it saved against doing it by hand. Modest numbers people believe are worth more than impressive ones they do not.',
  },
];

export const STEPS: Step[] = [
  {
    title: 'Pick something you achieved',
    body: 'Anything you got done with an agent. It does not need to be a feature: a migration nobody noticed, a flaky test finally fixed, an afternoon of tedium compressed into twenty minutes.',
  },
  {
    title: 'Say how you did it',
    body: 'How you directed the agent, and what it did rather than you. Add your own estimate of the effort and the days saved. Two fields are required and it takes about five minutes.',
  },
  {
    title: 'Share it to the wall',
    body: 'It appears here, it is searchable by tag and team, and it counts towards the totals above. Sign in with your work email; the Cursor API key is optional.',
  },
];

export const HONESTY_NOTE =
  'Effort and time saved are written by the people who did the work and are not verified against any system. Each total says how many achievements carried a figure, so you can see what it rests on.';
