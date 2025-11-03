# Tab Smash 👊

**Tab Smash** is a Chrome extension for managing browser tabs with folders, search, and local storage via Chrome Bookmarks.

Built on [Tab Stash](https://github.com/iannuttall/tab-stash) by Ian Nuttall.

## Features

- **Folder Organization**: Organize stashed tabs in nested folders
- **Archive**: Special folder for tabs excluded from search
- **Search**: Fast search across all stashed tabs with dynamic placeholders
- **Bulk Operations**: Multi-select tabs, move to folders, add/remove tags
- **Import/Export**: Import from bookmarks HTML, export to JSON
- **Open Windows View**: See all your open Chrome tabs and windows
- **Privacy-First**: All data stored locally using Chrome Bookmarks API

## Quick Start

Requirements: Chrome 114+, Node 18+, npm

```bash
# Clone the repo
git clone https://github.com/jbenton/tab-smash.git

# Install dependencies
cd tab-smash
npm i

# Build the extension
npm run build

# Load in Chrome
# Navigate to chrome://extensions
# Enable Developer mode → Load unpacked → select dist/
```

## Development

```bash
# Dev server (load extension separately)
npm run dev

# Type check
npm run typecheck

# Production build
npm run build

# Create release zip
npm run package
```

## Architecture

- **Multi-entry Vite build**: Dashboard, Side Panel, Background, Options
- **Chrome Bookmarks API**: Primary storage with metadata encoded in URL hash
- **shadcn/ui + Tailwind**: UI components and styling
- **TypeScript**: Full type safety

See [CLAUDE.md](CLAUDE.md) for detailed architecture and development guidelines.

## Data & Privacy

- No server communication
- All data stored locally in Chrome Bookmarks
- No analytics or telemetry

## Attribution

Tab Smash is based on [Tab Stash](https://github.com/iannuttall/tab-stash) by Ian Nuttall, licensed under MIT.

## License

MIT License - see [LICENSE](LICENSE)
 
