# Quick Start: Publishing Pi Planner

## What Was Created

```
Pi-Planner/
├── bin/
│   └── install.js          # npx entry point - installs the extension
├── extension/
│   ├── index.js            # Main extension logic (tasks, projects, planning)
│   └── manifest.json       # Extension metadata
├── package.json            # npm package configuration
├── index.js                # Package entry point
├── README.md               # User documentation
├── PUBLISHING.md           # Detailed publishing guide
├── LICENSE                 # MIT License
└── .gitignore             # Git ignore rules

```

## Next Steps (In Order)

### 1. Check Package Name Availability

```bash
npm view pi-planner
```

- If you get a 404 error → name is available, proceed to step 3
- If you see package info → name is taken, go to step 2

### 2. If Name Is Taken (Choose One Option)

**Option A: Use scoped package (recommended)**
```bash
cd /path/to/Pi-Planner
# Edit package.json and change "pi-planner" to "@thedenz3l/pi-planner"
```

**Option B: Pick a different name**
```bash
# Edit package.json and change to: "pi-planner-ext", "pi-task-planner", etc.
```

### 3. Login to npm

```bash
npm login
```

### 4. Test Locally (Optional but Recommended)

```bash
cd /path/to/Pi-Planner
npm link
pi-planner
# Check if files appear in ~/.pi/extensions/planner
```

### 5. Publish

For unscoped package:
```bash
npm publish
```

For scoped package:
```bash
npm publish --access public
```

### 6. Test Installation

```bash
npx pi-planner
# or
npx @thedenz3l/pi-planner
```

## What Users Will Do

Once published, users install your extension with a single command:

```bash
npx pi-planner
```

This will:
1. Download your package
2. Copy extension files to `~/.pi/extensions/planner`
3. Update `~/.pi/config.json` to enable the extension
4. Display success message

## Important Notes

- **First time publishing?** You need an npm account: https://www.npmjs.com/signup
- **Package name taken?** Use `@thedenz3l/pi-planner` (scoped package)
- **Updates?** Run `npm version patch`, then `npm publish`
- **Testing?** Use `npm link` to test locally before publishing

## One-Line Publish Command

If name is available and you're logged in:

```bash
cd /path/to/Pi-Planner && npm publish
```

For scoped package:

```bash
cd /path/to/Pi-Planner && npm publish --access public
```

## After Publishing

Update your README with the actual installation command and add an npm badge:

```markdown
[![npm version](https://img.shields.io/npm/v/pi-planner.svg)](https://www.npmjs.com/package/pi-planner)
```

## Need Help?

- See `PUBLISHING.md` for detailed troubleshooting
- Check npm docs: https://docs.npmjs.com/cli/v9/commands/npm-publish
