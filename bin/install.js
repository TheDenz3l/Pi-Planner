#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const os = require('os');

const chalk = require('chalk');

const homeDir = os.homedir();
const piExtensionsDir = path.join(homeDir, '.pi', 'extensions', 'planner');

async function install() {
  console.log(chalk.blue('📋 Installing Pi Planner extension...\n'));

  try {
    // Create extensions directory if it doesn't exist
    await fs.ensureDir(piExtensionsDir);

    // Copy extension files
    const extensionSource = path.join(__dirname, '..', 'extension');
    await fs.copy(extensionSource, piExtensionsDir, { overwrite: true });

    console.log(chalk.green('✓ Extension files copied to:'));
    console.log(chalk.gray(`  ${piExtensionsDir}\n`));

    // Create or update Pi config
    const piConfigPath = path.join(homeDir, '.pi', 'config.json');
    let config = {};

    if (await fs.pathExists(piConfigPath)) {
      config = await fs.readJson(piConfigPath);
    }

    if (!config.extensions) {
      config.extensions = [];
    }

    // Add planner extension if not already present
    const plannerExtension = {
      name: 'planner',
      enabled: true,
      path: piExtensionsDir
    };

    const existingIndex = config.extensions.findIndex(ext => ext.name === 'planner');
    if (existingIndex >= 0) {
      config.extensions[existingIndex] = plannerExtension;
      console.log(chalk.yellow('✓ Updated existing planner extension configuration\n'));
    } else {
      config.extensions.push(plannerExtension);
      console.log(chalk.green('✓ Added planner extension to configuration\n'));
    }

    await fs.writeJson(piConfigPath, config, { spaces: 2 });

    console.log(chalk.green.bold('✨ Pi Planner installed successfully!\n'));
    console.log(chalk.white('The planner extension is now available in Pi.'));
    console.log(chalk.gray('Restart Pi to load the extension.\n'));

  } catch (error) {
    console.error(chalk.red('✗ Installation failed:'), error.message);
    process.exit(1);
  }
}

install();
