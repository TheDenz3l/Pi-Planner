# Pi Planner

Planner workflow extension for Pi with a strict three-phase flow:

1. **Planning** (questioning + clarifications)
2. **Implementation** (execute changes)
3. **Summary** (final recap, no further edits)

## Install

```bash
pi install npm:pi-planner
```

Then run:

```bash
/reload
```

## Usage

### Start planning

```bash
/plan Build a desktop-first landlord maintenance app
```

### Planner commands

- `/plan [goal]` — start planning mode
- `/plan execute` — force switch to implementation mode
- `/plan status` — show planner state
- `/plan doctor` — diagnostics (model/tools/state)
- `/plan off` — disable planner and restore default tools

## What this extension does

- In **planning mode**, it enforces read-only exploration and asks structured multiple-choice clarifying questions via `planner_questionnaire`.
- After a plan is finalized (`planner_finalize_plan`), it auto-switches to implementation mode.
- In **implementation mode**, it enables coding tools and nudges finder-first execution.
- After implementation, it enters **summary mode** (read-only) and produces a final recap.

## Notes

- This package is a **Pi package** (not an `npx` installer).
- Install/update/remove it with Pi package commands:

```bash
pi install npm:pi-planner
pi update
pi remove npm:pi-planner
```

## Development

```bash
git clone https://github.com/TheDenz3l/Pi-Planner.git
cd Pi-Planner
```

Test locally without publishing:

```bash
pi install /absolute/path/to/Pi-Planner
/reload
```

## License

MIT
