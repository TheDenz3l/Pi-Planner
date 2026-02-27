import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

type PlannerMode = "off" | "planning" | "implementing" | "summarizing";

type ModelCandidate = {
	provider: string;
	id: string;
};

type SwitchModelOptions = {
	notify?: boolean;
};

const FALLBACK_DEFAULT_TOOLS = ["read", "bash", "edit", "write"];
const PLANNING_TOOLS = ["read", "grep", "find", "ls", "finder", "planner_questionnaire", "planner_finalize_plan"];
const IMPLEMENTATION_TOOLS = ["read", "bash", "edit", "write", "grep", "find", "ls", "finder"];
const SUMMARY_TOOLS = ["read", "grep", "find", "ls", "finder"];

const PLANNING_MODELS: ModelCandidate[] = [
	{ provider: "kiro", id: "claude-opus-4.6" },
];

const IMPLEMENTATION_MODELS: ModelCandidate[] = [{ provider: "openai-codex", id: "gpt-5.3-codex" }];

const PLANNING_TARGET_MODEL = "kiro/claude-opus-4.6";
const IMPLEMENTATION_TARGET_MODEL = "openai-codex/gpt-5.3-codex";
const SUMMARY_TARGET_MODEL = PLANNING_TARGET_MODEL;

const PlannerQuestionnaireParams = Type.Object({
	question: Type.String({ description: "The clarifying question to ask the user." }),
	options: Type.Array(Type.String({ minLength: 1 }), {
		description: "2-6 concise multiple-choice options.",
		minItems: 2,
		maxItems: 6,
	}),
	recommendedIndex: Type.Optional(
		Type.Number({ description: "0-based index of the recommended answer after thinking." }),
	),
	recommendationReason: Type.Optional(Type.String({ description: "Short reason for the recommendation." })),
});

const PlannerFinalizePlanParams = Type.Object({
	summary: Type.String({ description: "Brief summary of the implementation plan (1-2 sentences)." }),
});

export default function plannerExtension(pi: ExtensionAPI): void {
	let mode: PlannerMode = "off";
	let lastGoal = "";
	let lastPlanSummary = "";
	let hasPromptedAutoSwitch = false;
	let pendingImplementationSummary = false;
	let activeModelLabel = "";
	let activationVersion = 0;
	let defaultTools = [...FALLBACK_DEFAULT_TOOLS];

	function getAvailableToolNames(): string[] {
		return pi.getAllTools().map((tool) => tool.name);
	}

	function formatModelLabel(provider: string, id: string): string {
		return `${provider}/${id}`;
	}

	function modelMatchesAnyCandidate(model: { provider: string; id: string } | undefined, candidates: ModelCandidate[]): boolean {
		if (!model) return false;
		return candidates.some((candidate) => candidate.provider === model.provider && candidate.id === model.id);
	}

	function sendPlannerUserMessage(ctx: ExtensionContext, content: string, reason: string): void {
		try {
			if (ctx.isIdle()) {
				pi.sendUserMessage(content);
				return;
			}
			pi.sendUserMessage(content, { deliverAs: "followUp" });
			ctx.ui.notify(
				`Planner (${reason}): queued message as follow-up because the agent is still processing.`,
				"info",
			);
		} catch {
			pi.sendUserMessage(content, { deliverAs: "followUp" });
			ctx.ui.notify(
				`Planner (${reason}): queued message as follow-up due a model-switch timing race.`,
				"info",
			);
		}
	}

	function setTools(ctx: ExtensionContext, preferredTools: string[], reason: string): void {
		const available = new Set(getAvailableToolNames());
		const chosen = preferredTools.filter((name) => available.has(name));
		const missing = preferredTools.filter((name) => !available.has(name));

		const toApply = chosen.length > 0 ? chosen : defaultTools.filter((name) => available.has(name));
		if (toApply.length > 0) {
			pi.setActiveTools(toApply);
		}

		if (missing.includes("finder")) {
			ctx.ui.notify(
				`Planner (${reason}): finder tool not available. Install/enable your finder extension to use finder-guided flow.`,
				"warning",
			);
		}
	}

	async function switchModel(
		ctx: ExtensionContext,
		candidates: ModelCandidate[],
		reason: string,
		options: SwitchModelOptions = {},
	): Promise<boolean> {
		const shouldNotify = options.notify ?? true;

		if (modelMatchesAnyCandidate(ctx.model, candidates) && ctx.model) {
			activeModelLabel = formatModelLabel(ctx.model.provider, ctx.model.id);
			if (shouldNotify) {
				ctx.ui.notify(`Planner (${reason}): model already active: ${activeModelLabel}`, "info");
			}
			return true;
		}

		for (const candidate of candidates) {
			const model = ctx.modelRegistry.find(candidate.provider, candidate.id);
			if (!model) continue;
			const ok = await pi.setModel(model);
			if (ok) {
				activeModelLabel = formatModelLabel(candidate.provider, candidate.id);
				if (shouldNotify) {
					ctx.ui.notify(`Planner (${reason}): model set to ${activeModelLabel}`, "info");
				}
				return true;
			}
		}

		const list = candidates.map((c) => `${c.provider}/${c.id}`).join(", ");
		if (shouldNotify) {
			ctx.ui.notify(`Planner (${reason}): unable to activate any target model (${list}).`, "warning");
		}
		return false;
	}

	function persistState(): void {
		pi.appendEntry("planner-state", {
			mode,
			lastGoal,
			lastPlanSummary,
			hasPromptedAutoSwitch,
			pendingImplementationSummary,
			timestamp: Date.now(),
		});
	}

	function looksLikeCompletedPlan(text: string): boolean {
		const normalized = text.trim();
		if (!normalized) return false;
		
		// Explicit plan headers
		if (/(^|\n)\s*(plan|implementation plan|execution plan|implementation steps)\s*[:\-]/i.test(normalized)) {
			return true;
		}

		// Numbered steps (very common)
		const numberedSteps = (normalized.match(/(^|\n)\s*\d+[.)]\s+/g) ?? []).length;
		if (numberedSteps >= 2) {
			return true;
		}

		// Bullet steps with implementation keywords
		const bulletSteps = (normalized.match(/(^|\n)\s*[-*]\s+/g) ?? []).length;
		const hasPlanningLanguage = /\b(plan|steps?|implementation|execute|build|change|update|create|modify|add)\b/i.test(normalized);
		if (hasPlanningLanguage && bulletSteps >= 3) {
			return true;
		}

		// Step-by-step language
		if (/step\s+\d+/i.test(normalized) && numberedSteps >= 1) {
			return true;
		}

		return false;
	}

	function updateStatus(ctx: ExtensionContext): void {
		if (mode === "planning") {
			const label = activeModelLabel || PLANNING_TARGET_MODEL;
			ctx.ui.setStatus("planner", ctx.ui.theme.fg("warning", `🧭 planner: questioning (${label})`));
			ctx.ui.setWidget("planner", [
				ctx.ui.theme.fg("muted", "Planner mode: clarify scope, then auto-switch to implementation"),
				ctx.ui.theme.fg("muted", `Target model: ${PLANNING_TARGET_MODEL}`),
			]);
			return;
		}

		if (mode === "implementing") {
			const label = activeModelLabel || IMPLEMENTATION_TARGET_MODEL;
			ctx.ui.setStatus("planner", ctx.ui.theme.fg("accent", `⚙ planner: implementing (${label})`));
			ctx.ui.setWidget("planner", [
				ctx.ui.theme.fg("muted", "Implementation mode: finder-first, then execute"),
				ctx.ui.theme.fg("muted", `Target model: ${IMPLEMENTATION_TARGET_MODEL}`),
			]);
			return;
		}

		if (mode === "summarizing") {
			const label = activeModelLabel || SUMMARY_TARGET_MODEL;
			ctx.ui.setStatus("planner", ctx.ui.theme.fg("success", `📝 planner: summary (${label})`));
			ctx.ui.setWidget("planner", [
				ctx.ui.theme.fg("muted", "Summary mode: final recap only (no file edits)"),
				ctx.ui.theme.fg("muted", `Target model: ${SUMMARY_TARGET_MODEL}`),
			]);
			return;
		}

		ctx.ui.setStatus("planner", undefined);
		ctx.ui.setWidget("planner", undefined);
	}

	async function activatePlanning(ctx: ExtensionContext, goal?: string): Promise<void> {
		const activation = ++activationVersion;
		mode = "planning";
		hasPromptedAutoSwitch = false;
		pendingImplementationSummary = false;
		if (goal?.trim()) lastGoal = goal.trim();

		setTools(ctx, PLANNING_TOOLS, "planning");
		await switchModel(ctx, PLANNING_MODELS, "planning");
		if (activation !== activationVersion) return;
		pi.setThinkingLevel("high");
		updateStatus(ctx);
		persistState();

		const kickoff = goal?.trim()
			? `Task/issue:\n${goal.trim()}\n\nStart now by calling planner_questionnaire for the first clarifying question. For every clarifying question, use planner_questionnaire with multiple-choice options and a recommended option based on your reasoning. Do not implement yet.`
			: `Enter questioning mode and start now by calling planner_questionnaire for the first clarifying question. For every clarifying question, use planner_questionnaire with multiple-choice options and a recommended option based on your reasoning. Do not implement yet.`;

		if (activation !== activationVersion) return;
		sendPlannerUserMessage(ctx, kickoff, "planning");
	}

	async function activateImplementation(ctx: ExtensionContext): Promise<void> {
		const activation = ++activationVersion;
		const previousMode = mode;
		mode = "implementing";
		hasPromptedAutoSwitch = true;
		pendingImplementationSummary = true;
		setTools(ctx, IMPLEMENTATION_TOOLS, "implementation");
		const switched = await switchModel(ctx, IMPLEMENTATION_MODELS, "implementation");
		if (activation !== activationVersion) return;
		if (!switched) {
			mode = previousMode === "off" ? "off" : "planning";
			hasPromptedAutoSwitch = false;
			pendingImplementationSummary = false;
			if (mode === "planning") {
				setTools(ctx, PLANNING_TOOLS, "implementation-abort");
			} else {
				setTools(ctx, defaultTools, "implementation-abort");
			}
			updateStatus(ctx);
			persistState();
			ctx.ui.notify(
				`Planner: implementation requires ${IMPLEMENTATION_TARGET_MODEL}. Could not switch, so execution was not started.`,
				"warning",
			);
			return;
		}
		pi.setThinkingLevel("high"); // "gpt-5.3-codex high"
		updateStatus(ctx);
		persistState();

		const prompt = [
			"Switch to implementation now.",
			lastGoal ? `Goal: ${lastGoal}` : "",
			lastPlanSummary ? `Plan summary:\n${lastPlanSummary}` : "",
			"Use finder first to identify the exact files/symbols to modify, then implement the plan step-by-step.",
		]
			.filter(Boolean)
			.join("\n\n");

		if (activation !== activationVersion) return;
		sendPlannerUserMessage(ctx, prompt, "implementation");
	}

	async function activateSummary(ctx: ExtensionContext): Promise<boolean> {
		const activation = ++activationVersion;
		const previousMode = mode;
		mode = "summarizing";
		hasPromptedAutoSwitch = false;
		setTools(ctx, SUMMARY_TOOLS, "summary");
		const switched = await switchModel(ctx, PLANNING_MODELS, "summary");
		if (activation !== activationVersion) return false;
		if (!switched) {
			mode = previousMode;
			updateStatus(ctx);
			persistState();
			ctx.ui.notify(
				`Planner: final summary requires ${SUMMARY_TARGET_MODEL}. Could not switch models, so staying in ${previousMode} mode.`,
				"warning",
			);
			return false;
		}
		pi.setThinkingLevel("high");
		updateStatus(ctx);
		persistState();
		return true;
	}

	function resetPlanner(ctx: ExtensionContext): void {
		activationVersion += 1;
		mode = "off";
		hasPromptedAutoSwitch = false;
		pendingImplementationSummary = false;
		setTools(ctx, defaultTools, "reset");
		updateStatus(ctx);
		persistState();
		ctx.ui.notify("Planner disabled.", "info");
	}

	pi.registerTool({
		name: "planner_questionnaire",
		label: "Planner Questionnaire",
		description:
			"Ask a single multiple-choice clarifying question with a recommended answer. Use this during planning mode, one question at a time.",
		parameters: PlannerQuestionnaireParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const options = Array.from(new Set(params.options.map((o) => o.trim()).filter(Boolean))).slice(0, 6);
			if (options.length < 2) {
				return {
					content: [{ type: "text", text: "planner_questionnaire requires at least 2 non-empty options." }],
					details: { error: "not_enough_options" },
					isError: true,
				};
			}

			const normalizeLine = (value: string): string => value.replace(/\s+/g, " ").trim();

			const rawRecommended = Number.isInteger(params.recommendedIndex)
				? (params.recommendedIndex as number)
				: 0;
			const recommendedIndex = Math.max(0, Math.min(options.length - 1, rawRecommended));
			const normalizedQuestion = normalizeLine(params.question);
			const recommendedOption = options[recommendedIndex];
			const recommendationReason = params.recommendationReason?.trim()
				? normalizeLine(params.recommendationReason)
				: undefined;
			const optionLabels = options.map((_, i) => String.fromCharCode(65 + i));
			const recommendedLabel = optionLabels[recommendedIndex] ?? "A";

			const decoratedOptions = options.map((opt, i) => {
				const marker = i === recommendedIndex ? "★" : " ";
				return `${marker} [${optionLabels[i]}] ${opt}`;
			});

			const customLabel = String.fromCharCode(65 + options.length);
			const customOption = ` [${customLabel}] Enter custom response...`;
			const allOptions = [...decoratedOptions, customOption];

			if (!ctx.hasUI) {
				return {
					content: [
						{
							type: "text",
							text: [
								"Planner clarifying question",
								`Q: ${normalizedQuestion}`,
								"",
								`Recommended: [${recommendedLabel}] ${recommendedOption}`,
								recommendationReason ? `Why: ${recommendationReason}` : "",
								"",
								`Selected: [${recommendedLabel}] ${recommendedOption} (default; no interactive UI).`,
							]
								.filter(Boolean)
								.join("\n"),
						},
					],
					details: {
						question: normalizedQuestion,
						options,
						recommendedIndex,
						recommendedLabel,
						selectedIndex: recommendedIndex,
						selected: recommendedOption,
						usedDefaultSelection: true,
					},
				};
			}

			const selectPrompt = [
				"🧭 Planner clarifying question",
				"",
				`Q: ${normalizedQuestion}`,
				"",
				`Recommended: [${recommendedLabel}] ${recommendedOption}`,
				recommendationReason ? `Why: ${recommendationReason}` : undefined,
				"",
				"Choose an option (↑/↓ + Enter), or select custom input option.",
			]
				.filter(Boolean)
				.join("\n");
			const selectedDecorated = await ctx.ui.select(selectPrompt, allOptions);

			let selected: string;
			let selectedLabel: string;
			let selectedIndex: number;
			let usedDefaultSelection = false;
			let isCustomInput = false;

			if (selectedDecorated === customOption) {
				const customInput = await ctx.ui.input("Enter your custom response:", "");
				if (customInput !== undefined && customInput.trim()) {
					selected = customInput.trim();
					selectedLabel = customLabel;
					selectedIndex = options.length;
					isCustomInput = true;
				} else {
					selected = recommendedOption;
					selectedLabel = recommendedLabel;
					selectedIndex = recommendedIndex;
					usedDefaultSelection = true;
				}
			} else if (selectedDecorated !== undefined) {
				const idx = decoratedOptions.indexOf(selectedDecorated);
				selectedIndex = idx >= 0 ? idx : recommendedIndex;
				selected = options[selectedIndex] ?? recommendedOption;
				selectedLabel = optionLabels[selectedIndex] ?? recommendedLabel;
			} else {
				selected = recommendedOption;
				selectedLabel = recommendedLabel;
				selectedIndex = recommendedIndex;
				usedDefaultSelection = true;
			}

			return {
				content: [
					{
						type: "text",
						text: [
							`Q: ${normalizedQuestion}`,
							`Selected: [${selectedLabel}] ${selected}`,
							isCustomInput ? "(Custom input)" : `Recommended: [${recommendedLabel}] ${recommendedOption}`,
							recommendationReason && !isCustomInput ? `Why: ${recommendationReason}` : "",
							usedDefaultSelection ? "(Selection cancelled; recommendation used.)" : "",
						]
							.filter(Boolean)
							.join("\n"),
					},
				],
				details: {
					question: normalizedQuestion,
					options,
					recommendedIndex,
					recommendedLabel,
					selectedIndex,
					selected,
					recommendedOption,
					recommendationReason,
					usedDefaultSelection,
					isCustomInput,
				},
			};
		},
	});

	pi.registerTool({
		name: "planner_finalize_plan",
		label: "Planner Finalize Plan",
		description:
			"Signal that planning is complete and implementation should begin. Call this after providing the final implementation plan with numbered steps.",
		parameters: PlannerFinalizePlanParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (mode !== "planning") {
				return {
					content: [{ type: "text", text: "planner_finalize_plan can only be called during planning mode." }],
					details: { error: "wrong_mode", currentMode: mode },
					isError: true,
				};
			}

			const summary = params.summary?.trim() || "Plan ready for implementation.";
			lastPlanSummary = summary;
			persistState();

			ctx.ui.notify("Planner: plan finalized. Switching to implementation mode on Codex...", "info");

			// Trigger implementation handoff
			await activateImplementation(ctx);

			return {
				content: [
					{
						type: "text",
						text: `Plan finalized. Switching to implementation mode on ${IMPLEMENTATION_TARGET_MODEL}...`,
					},
				],
				details: { summary, nextMode: "implementing" },
			};
		},
	});

	pi.registerCommand("plan", {
		description:
			"Planner workflow: /plan [goal] (questioning on Opus, then auto-implementation on gpt-5.3-codex, then auto-summary on Opus), /plan execute (manual force), /plan status, /plan doctor (diagnostics), /plan off",
		handler: async (args, ctx) => {
			const input = (args ?? "").trim();
			const normalized = input.toLowerCase();

			const waitForIdleIfNeeded = async (nextMode: "planning" | "implementation"): Promise<void> => {
				if (ctx.isIdle()) return;
				ctx.ui.notify(
					`Planner: waiting for the current response to finish before switching to ${nextMode} mode...`,
					"info",
				);
				await ctx.waitForIdle();
			};

			if (!input || normalized === "start") {
				await waitForIdleIfNeeded("planning");
				await activatePlanning(ctx);
				return;
			}

			if (["execute", "apply", "implement", "go", "done", "finalize", "complete"].includes(normalized)) {
				await waitForIdleIfNeeded("implementation");
				await activateImplementation(ctx);
				return;
			}

			if (["status", "state"].includes(normalized)) {
				const modelLabel =
					activeModelLabel ||
					(mode === "planning"
						? PLANNING_TARGET_MODEL
						: mode === "implementing"
							? IMPLEMENTATION_TARGET_MODEL
							: SUMMARY_TARGET_MODEL);
				ctx.ui.notify(
					`Planner mode: ${mode}${lastGoal ? ` | goal: ${lastGoal}` : ""}${mode !== "off" ? ` | model: ${modelLabel}` : ""}`,
					"info",
				);
				return;
			}

			if (["doctor", "debug", "diagnose"].includes(normalized)) {
				const currentModel = ctx.model ? formatModelLabel(ctx.model.provider, ctx.model.id) : "none";
				const targetModel =
					mode === "planning"
						? PLANNING_TARGET_MODEL
						: mode === "implementing"
							? IMPLEMENTATION_TARGET_MODEL
							: mode === "summarizing"
								? SUMMARY_TARGET_MODEL
								: "none";
				const modelMatches =
					mode === "off" ||
					(mode === "planning" && modelMatchesAnyCandidate(ctx.model, PLANNING_MODELS)) ||
					(mode === "implementing" && modelMatchesAnyCandidate(ctx.model, IMPLEMENTATION_MODELS)) ||
					(mode === "summarizing" && modelMatchesAnyCandidate(ctx.model, PLANNING_MODELS));

				const availableTools = getAvailableToolNames();
				const activeTools = pi.getActiveTools().map((t) => t.name);
				const planningToolsAvailable = PLANNING_TOOLS.every((t) => availableTools.includes(t));
				const implementationToolsAvailable = IMPLEMENTATION_TOOLS.every((t) => availableTools.includes(t));

				const planPreview = lastPlanSummary ? lastPlanSummary.slice(0, 200).replace(/\n/g, " ") : "none";
				const wouldMatchHeuristic = lastPlanSummary ? looksLikeCompletedPlan(lastPlanSummary) : false;

				const diagnostics = [
					"🔍 Planner Diagnostics",
					"",
					`Mode: ${mode}`,
					`Current model: ${currentModel}`,
					`Target model: ${targetModel}`,
					`Model matches: ${modelMatches ? "✅" : "❌"}`,
					`Active model label: ${activeModelLabel || "not set"}`,
					"",
					`Last goal: ${lastGoal || "none"}`,
					`Has prompted auto-switch: ${hasPromptedAutoSwitch}`,
					`Pending implementation summary: ${pendingImplementationSummary}`,
					`Activation version: ${activationVersion}`,
					"",
					`Last plan preview: ${planPreview}`,
					`Plan would match heuristic: ${wouldMatchHeuristic ? "✅" : "❌"}`,
					"",
					`Planning tools available: ${planningToolsAvailable ? "✅" : "❌"}`,
					`Implementation tools available: ${implementationToolsAvailable ? "✅" : "❌"}`,
					`Active tools (${activeTools.length}): ${activeTools.slice(0, 8).join(", ")}${activeTools.length > 8 ? "..." : ""}`,
				].join("\n");

				ctx.ui.notify(diagnostics, "info");
				return;
			}

			if (["off", "stop", "reset"].includes(normalized)) {
				await waitForIdleIfNeeded("planning");
				resetPlanner(ctx);
				return;
			}

			// Treat everything else as the task/issue to plan.
			await waitForIdleIfNeeded("planning");
			await activatePlanning(ctx, input);
		},
	});

	pi.on("before_agent_start", async (event, ctx) => {
		if (mode === "planning") {
			if (!modelMatchesAnyCandidate(ctx.model, PLANNING_MODELS)) {
				await switchModel(ctx, PLANNING_MODELS, "planning-turn", { notify: false });
				updateStatus(ctx);
			}
			return {
				systemPrompt: `${event.systemPrompt}\n\n[PLANNER MODE: QUESTIONING]\n- You are planning only. Do NOT implement or edit files yet.\n- You MUST ask clarifying questions via planner_questionnaire; do not ask plain-text questions directly.\n- For each question, call planner_questionnaire with 3-6 concise multiple-choice options and set recommendedIndex to the best answer after reasoning.\n- Include recommendationReason as one short sentence (max ~160 chars) explaining why that option is best.\n- Keep options realistic and actionable for the current task/issue.\n- Continue one question at a time until requirements are complete.\n- Once information is sufficient, provide a concrete implementation plan with numbered steps.\n- After providing the plan, call planner_finalize_plan with a brief summary to trigger automatic handoff to implementation mode on Codex.\n- If tools are needed, keep to read-only exploration. Bash is disabled in planning mode; use finder/read/grep/find/ls only.`,
			};
		}

		if (mode === "implementing") {
			if (!modelMatchesAnyCandidate(ctx.model, IMPLEMENTATION_MODELS)) {
				const switched = await switchModel(ctx, IMPLEMENTATION_MODELS, "implementation-turn", { notify: false });
				if (!switched) {
					mode = "planning";
					pendingImplementationSummary = false;
					setTools(ctx, PLANNING_TOOLS, "implementation-model-missing");
					updateStatus(ctx);
					persistState();
					ctx.ui.notify(
						`Planner: implementation turn blocked because ${IMPLEMENTATION_TARGET_MODEL} is unavailable. Returned to planning mode.`,
						"warning",
					);
					return {
						systemPrompt: `${event.systemPrompt}\n\n[PLANNER MODE: BLOCKED IMPLEMENTATION]\n- Required implementation model (${IMPLEMENTATION_TARGET_MODEL}) is unavailable.\n- Do NOT implement or edit files in this turn.\n- Tell the user implementation was blocked due to model-switch failure and ask them to fix model availability, then run /plan execute again.`,
					};
				}
				updateStatus(ctx);
			}
			return {
				systemPrompt: `${event.systemPrompt}\n\n[PLANNER MODE: IMPLEMENTATION]\n- Execute the finalized plan now.\n- Use finder first to locate targets, then read/edit/write surgically.\n- Keep changes scoped to the agreed plan and summarize what was implemented.`,
			};
		}

		if (mode === "summarizing") {
			if (!modelMatchesAnyCandidate(ctx.model, PLANNING_MODELS)) {
				const switched = await switchModel(ctx, PLANNING_MODELS, "summary-turn", { notify: false });
				if (!switched) {
					mode = "off";
					setTools(ctx, defaultTools, "summary-model-missing");
					updateStatus(ctx);
					persistState();
					ctx.ui.notify(
						`Planner: summary turn blocked because ${SUMMARY_TARGET_MODEL} is unavailable. Planner turned off.`,
						"warning",
					);
					return {
						systemPrompt: `${event.systemPrompt}\n\n[PLANNER MODE: BLOCKED SUMMARY]\n- Required summary model (${SUMMARY_TARGET_MODEL}) is unavailable.\n- Do NOT implement additional changes in this turn.\n- Tell the user summary was blocked due to model-switch failure.`,
					};
				}
				updateStatus(ctx);
			}
			return {
				systemPrompt: `${event.systemPrompt}\n\n[PLANNER MODE: SUMMARY]\n- You are producing the final implementation recap only.\n- Do NOT ask clarifying questions and do NOT implement additional changes.\n- Prefer no tool calls unless absolutely necessary to verify what changed. Bash is disabled in summary mode.\n- Provide a concise user-facing summary that includes: files changed, what changed, and any risks/follow-ups.`,
			};
		}
	});

	pi.on("agent_end", async (event, ctx) => {
		const lastAssistant = [...event.messages].reverse().find((m) => m.role === "assistant");
		const text =
			lastAssistant && Array.isArray(lastAssistant.content)
				? lastAssistant.content
						.filter((block): block is { type: "text"; text: string } => block.type === "text")
						.map((block) => block.text)
						.join("\n")
				: "";

		if (mode === "implementing" && pendingImplementationSummary) {
			pendingImplementationSummary = false;
			const enteredSummary = await activateSummary(ctx);
			if (!enteredSummary) {
				persistState();
				return;
			}
			sendPlannerUserMessage(
				ctx,
				[
					"Implementation is complete. Do not call tools or make any additional edits.",
					"Provide a final user-facing summary with:",
					"- files changed",
					"- what changed",
					"- notable risks/follow-ups",
				].join("\n"),
				"summary",
			);
			return;
		}

		if (mode === "summarizing") {
			if (text.trim()) {
				lastPlanSummary = text.slice(0, 4000);
			}
			activationVersion += 1;
			mode = "off";
			hasPromptedAutoSwitch = false;
			pendingImplementationSummary = false;
			setTools(ctx, defaultTools, "summary-complete");
			updateStatus(ctx);
			persistState();
			ctx.ui.notify("Planner summary complete on Opus. Planner is now off.", "info");
			return;
		}

		if (mode !== "planning") return;
		if (!looksLikeCompletedPlan(text)) return;

		lastPlanSummary = text.slice(0, 4000);
		persistState();

		if (hasPromptedAutoSwitch) return;
		hasPromptedAutoSwitch = true;
		ctx.ui.notify("Planner: plan detected. Auto-switching to implementation mode now.", "info");
		await activateImplementation(ctx);
	});

	pi.on("tool_call", async (event) => {
		if (mode !== "planning" && mode !== "summarizing") return;
		if (event.toolName === "edit" || event.toolName === "write") {
			return {
				block: true,
				reason:
					mode === "summarizing"
						? "Planner summary mode is read-only. No edits/writes are allowed during final recap."
						: "Planner questioning mode is read-only. Planner auto-switches to implementation once planning is complete (or use /plan execute to force).",
			};
		}
		if (event.toolName === "bash") {
			return {
				block: true,
				reason:
					mode === "summarizing"
						? "Planner summary mode is read-only. Bash is disabled during final recap."
						: "Planner questioning mode is read-only. Bash stays disabled until Planner auto-switches to implementation (or /plan execute is used).",
			};
		}
	});

	pi.on("model_select", async (event, ctx) => {
		activeModelLabel = formatModelLabel(event.model.provider, event.model.id);
		if (mode !== "off") {
			updateStatus(ctx);
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.model) {
			activeModelLabel = formatModelLabel(ctx.model.provider, ctx.model.id);
		}

		const entries = ctx.sessionManager.getEntries();
		const stateEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "planner-state")
			.pop() as
			| {
					data?: {
						mode?: PlannerMode;
						lastGoal?: string;
						lastPlanSummary?: string;
						hasPromptedAutoSwitch?: boolean;
						pendingImplementationSummary?: boolean;
					};
			  }
			| undefined;

		if (stateEntry?.data?.mode) {
			mode = stateEntry.data.mode;
			lastGoal = stateEntry.data.lastGoal ?? "";
			lastPlanSummary = stateEntry.data.lastPlanSummary ?? "";
			hasPromptedAutoSwitch = stateEntry.data.hasPromptedAutoSwitch ?? false;
			pendingImplementationSummary = stateEntry.data.pendingImplementationSummary ?? false;
		}

		if (mode === "planning") {
			setTools(ctx, PLANNING_TOOLS, "restore-planning");
			await switchModel(ctx, PLANNING_MODELS, "restore-planning", { notify: false });
		}
		if (mode === "implementing") {
			setTools(ctx, IMPLEMENTATION_TOOLS, "restore-implementation");
			await switchModel(ctx, IMPLEMENTATION_MODELS, "restore-implementation", { notify: false });
		}
		if (mode === "summarizing") {
			setTools(ctx, SUMMARY_TOOLS, "restore-summary");
			await switchModel(ctx, PLANNING_MODELS, "restore-summary", { notify: false });
		}

		updateStatus(ctx);
	});
}
