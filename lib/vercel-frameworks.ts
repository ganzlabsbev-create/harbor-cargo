// A conservative, hand-picked list of Vercel's built-in framework presets —
// covers everything lib/framework-detect.ts can already identify. Kept as
// a static list rather than a live API call since Vercel doesn't expose a
// simple public "list frameworks" endpoint; this only affects the default
// build settings Vercel pre-fills, and can always be overridden manually
// in the Build & Development Settings section.
//
// Split into its own file (rather than living in lib/vercel.ts) so the
// client-side project-settings form can import just this small constant
// without pulling in the server-side API wrapper.
export const VERCEL_FRAMEWORKS: { label: string; value: string | null }[] = [
  { label: "Next.js", value: "nextjs" },
  { label: "Vite", value: "vite" },
  { label: "SvelteKit", value: "svelte" },
  { label: "Nuxt", value: "nuxtjs" },
  { label: "Astro", value: "astro" },
  { label: "Gatsby", value: "gatsby" },
  { label: "Remix", value: "remix" },
  { label: "Create React App", value: "create-react-app" },
  { label: "Angular", value: "angular" },
  { label: "Static / Other", value: null },
];
