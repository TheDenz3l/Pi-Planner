# Pi Planner Extension

Enhanced planning and task management capabilities for Pi AI assistant.

## Installation

Install the extension using npx:

```bash
npx pi-planner
```

This will automatically install the planner extension to your Pi configuration.

## Features

- **Task Management**: Create, list, complete, and delete tasks
- **Project Organization**: Organize tasks into projects with milestones
- **Planning Tools**: Break down complex tasks into actionable steps
- **Persistent Storage**: All data is stored locally in `~/.pi/planner-data`

## Usage

Once installed, the planner extension adds the following commands to Pi:

### Planning

```bash
plan "Build a web application"
```

Creates a structured plan for your task or project.

### Task Management

```bash
# Add a new task
task add "Implement user authentication"

# List all tasks
task list

# List pending tasks only
task list --status pending

# Complete a task
task complete <task-id>

# Delete a task
task delete <task-id>
```

### Project Management

```bash
# Create a new project
project create "E-commerce Platform"

# List all projects
project list

# Add a task to a project
task add "Setup database" --project <project-id>
```

## Data Storage

All planner data is stored in:
- Tasks: `~/.pi/planner-data/tasks.json`
- Projects: `~/.pi/planner-data/projects.json`

## Configuration

The extension is configured in `~/.pi/config.json`:

```json
{
  "extensions": [
    {
      "name": "planner",
      "enabled": true,
      "path": "~/.pi/extensions/planner"
    }
  ]
}
```

## Uninstallation

To remove the extension:

1. Remove the extension from `~/.pi/config.json`
2. Delete the extension directory: `rm -rf ~/.pi/extensions/planner`
3. (Optional) Delete planner data: `rm -rf ~/.pi/planner-data`

## Development

### Local Development

```bash
git clone https://github.com/TheDenz3l/Pi-Planner.git
cd Pi-Planner
npm install
npm link
```

### Testing

```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please use the [GitHub issue tracker](https://github.com/TheDenz3l/Pi-Planner/issues).
