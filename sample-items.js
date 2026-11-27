// Sample items for a made-up small studio. They ship with the repo so the fire has something to show.
// To use your own, copy this file to items.js (git-ignored) and change `window.CRUCIBLE_SAMPLE` to
// `window.CRUCIBLE`. See README.md for every field.
//
// `by` and `deadline` take a date ("2027-01-15") or a number of days from today (3). The samples use
// numbers so they never go stale.
window.CRUCIBLE_SAMPLE = {
  title: 'Eisenhower matrix',
  goal: { label: 'the spring launch', date: 45 },
  items: [
    { q: 1, title: 'Send the launch proposal to the pilot customer', by: 2, deadline: 9, next: 'Final pricing table, then one read-through. Send before Friday.', key: 'OPS-12', url: 'https://example.atlassian.net/browse/OPS-12',
      description: 'The pilot customer asked for a written proposal after the demo.\n\nInclude:\n• Pricing for 10 and 25 seats\n• Onboarding timeline\n• Support hours\n\nDone when the signed proposal is back.' },
    { q: 1, title: 'Fix the broken signup form', by: 0, next: 'Error appears after the email step on mobile. Reproduce, patch, then test on a phone.',
      description: 'Three people reported a blank screen after entering their email on a phone. Desktop works.' },
    { q: 1, title: 'Renew the business license', by: 5, deadline: 12, next: 'The renewal form is online. Fees go up after the deadline.' },
    { q: 1, title: 'Book the venue for the workshop', by: 3, next: 'Two venues are holding the date until the end of the week.' },
    { q: 1, title: 'Draft the pilot contract', by: 10, next: 'Start from last year’s template; add the payment terms.' },
    { q: 2, title: 'Write the onboarding checklist', by: 14, next: 'One page. What a new person needs on day one, week one and month one.' },
    { q: 2, title: 'Quarterly planning day', by: 21, next: 'Pick a date and send the invite with the three questions to think about.' },
    { q: 2, title: 'Update the pricing page', by: 18, next: 'After the pilot proposal is signed, so the numbers match.' },
    { q: 2, title: 'Set up bookkeeping software', by: 28, next: 'Before the first invoice goes out.' },
    { q: 2, title: 'Record the product walkthrough video', by: 40, next: 'Script first. Five minutes, no more.' },
    { q: 2, title: 'Review insurance options', by: 50, next: 'Get two quotes for liability cover.' },
    { q: 3, title: 'Pay the overdue software invoice', by: -1, next: 'Five minutes. Or hand it to whoever owns vendor billing.' },
    { q: 3, title: 'Reply to the conference sponsorship email', by: 1, next: 'A polite no. Template reply is fine.' },
    { q: 3, title: 'Order new business cards', by: 6, next: 'Same design, new title. Anyone can place the order.' },
    { q: 4, title: 'Reorganize the shared drive', by: null, next: 'Nice to have. Revisit after the launch.' },
    { q: 4, title: 'Try a new note-taking app', by: null, next: 'The current one works. Drop it.' }
  ]
};
