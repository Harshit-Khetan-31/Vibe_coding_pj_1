/**
 * CONTACT copy and links. See `src/content/credits.ts` for the CC BY credit
 * that renders alongside this in the footer.
 */

export type SocialLink = {
  label: string
  // TODO(phase-6): real profile URLs. Rendered as-is once filled in.
  url: string
}

export const contact = {
  heading: "Let's talk",
  email: 'hello@harshitkhetan.com',
  timeZone: 'Asia/Kolkata',
  // TODO(phase-6): confirm handles/URLs before launch.
  socials: [
    { label: 'GitHub', url: '#' },
    { label: 'LinkedIn', url: '#' },
    { label: 'Instagram', url: '#' },
  ] satisfies SocialLink[],
}
