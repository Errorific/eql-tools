# eql-tools

Browser tools for EverQuest Legends. A static site built with SvelteKit and TypeScript, deployed to GitHub Pages.

## Tools

- **Gear Upgrade** - plan the motes, duplicate merges, and Void-Touched Potential needed to take an item to a target tier (+1 through +10).
- **Copy Pyramid** - for bulk-farm quest items, work out how many raw copies and Major motes reach a tier before Void-Touched finish it.

## Development

```sh
npm install
npm run dev
```

## Testing

```sh
npm test
```

## Building

```sh
npm run check
npm run build
npm run preview
```

The build outputs to `build/` and is deployed to GitHub Pages by the workflow in `.github/workflows/deploy.yml`.
