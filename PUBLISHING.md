# Publishing Guide for Pi Planner

## Prerequisites

1. **npm account**: Create one at https://www.npmjs.com/signup if you don't have one
2. **Node.js and npm**: Ensure they're installed (`node -v` and `npm -v`)

## Steps to Publish

### 1. Login to npm

```bash
npm login
```

Enter your npm username, password, and email when prompted.

### 2. Test Locally First

Before publishing, test the installation locally:

```bash
cd /path/to/Pi-Planner
npm link
```

Then test the command:

```bash
pi-planner
```

This should run the installation script. Check if files are copied to `~/.pi/extensions/planner`.

### 3. Check Package Name Availability

The package name `pi-planner` might be taken. Check availability:

```bash
npm view pi-planner
```

If it returns "npm ERR! 404", the name is available. If it shows package info, the name is taken.

**If the name is taken**, you have two options:

#### Option A: Use a scoped package (recommended)

Update `package.json`:
```json
{
  "name": "@thedenz3l/pi-planner",
  ...
}
```

Then publish with public access:
```bash
npm publish --access public
```

Users would install with:
```bash
npx @thedenz3l/pi-planner
```

#### Option B: Choose a different name

Update the `name` field in `package.json` to something unique like:
- `pi-planner-extension`
- `pi-task-planner`
- `thedenz3l-pi-planner`

### 4. Publish to npm

If the name is available:

```bash
npm publish
```

For scoped packages:

```bash
npm publish --access public
```

### 5. Verify Publication

Check that your package is live:

```bash
npm view pi-planner
# or
npm view @thedenz3l/pi-planner
```

### 6. Test Installation

Test the npx installation:

```bash
npx pi-planner
# or
npx @thedenz3l/pi-planner
```

## Updating the Package

When you make changes:

1. Update the version in `package.json`:
   ```bash
   npm version patch  # for bug fixes (1.0.0 -> 1.0.1)
   npm version minor  # for new features (1.0.0 -> 1.1.0)
   npm version major  # for breaking changes (1.0.0 -> 2.0.0)
   ```

2. Commit and push to GitHub:
   ```bash
   git push && git push --tags
   ```

3. Publish the update:
   ```bash
   npm publish
   ```

## Troubleshooting

### Permission Errors

If you get EACCES errors, don't use sudo. Instead, configure npm to use a different directory:

```bash
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Package Name Conflicts

If you get a 403 error, the package name is taken or you don't have permission. Use a scoped package or different name.

### Bin File Not Executable

Ensure the bin file has a shebang and is executable:

```bash
chmod +x bin/install.js
git add bin/install.js
git commit -m "Make install script executable"
git push
```

## Post-Publication

1. Update the README on GitHub with the correct installation command
2. Add a badge to show npm version:
   ```markdown
   ![npm version](https://img.shields.io/npm/v/pi-planner.svg)
   ```
3. Consider adding a CHANGELOG.md to track versions

## Security

- Never commit `.npmrc` files with auth tokens
- Use `npm token create` for CI/CD pipelines
- Enable 2FA on your npm account for security
