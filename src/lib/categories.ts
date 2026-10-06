/** Must match CATEGORIES in apps-script/Code.gs. Add a category in both places. */
export const CATEGORIES = [
  {
    id: 'best-dressed',
    title: 'Best Dressed',
    tagline: 'Red-carpet ready, from the hem to the hat.',
    nomineeLabel: 'WHO?',
    nomineePlaceholder: 'Their name',
    kind: 'person',
  },
  {
    id: 'couples',
    title: 'Best Couples Costume',
    tagline: 'Two stars, one billing.',
    nomineeLabel: 'WHICH PAIR?',
    nomineePlaceholder: 'Both names, e.g. Jo & Sam',
    kind: 'couple',
  },
  {
    id: 'scariest',
    title: 'Scariest Costume',
    tagline: 'The one you will see when you close your eyes.',
    nomineeLabel: 'WHO?',
    nomineePlaceholder: 'Their name',
    kind: 'person',
  },
] as const

export type Category = (typeof CATEGORIES)[number]
export type CategoryId = Category['id']
export type NomineeKind = Category['kind']
