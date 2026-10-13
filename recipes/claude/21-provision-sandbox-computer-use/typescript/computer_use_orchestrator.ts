import Anthropic from "@anthropic-ai/sdk";
import assert from "node:assert/strict";

// In-memory protocol simulator. No actual desktop or security boundary exists.
const SIMULATOR_WARNING =
  "PROTOCOL SIMULATOR ONLY: no desktop, container isolation, network filtering or human approval is implemented. Screenshots are a transparent 1x1 PNG. Live mode makes real Anthropic requests and may incur charges.";

// Minimal valid 1x1 transparent PNG base64
const PLACEHOLDER_SCREENSHOT_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";

interface DesktopActionInput {
  action: string;
  coordinate?: [number, number];
  text?: string;
  [key: string]: unknown;
}

class ComputerUseSimulator {
  public width: number;
  public height: number;
  public displayNumber: number;
  public cursorX: number = 0;
  public cursorY: number = 0;

  constructor(width = 1024, height = 768, displayNumber = 1) {
    this.width = width;
    this.height = height;
    this.displayNumber = displayNumber;
  }

  public executeAction(input: DesktopActionInput): Record<string, unknown> {
    const { action, coordinate, text } = input;

    if (action === "screenshot") {
      return {
        simulated: true,
        screenshot_base64: PLACEHOLDER_SCREENSHOT_BASE64,
        image_width: 1,
        image_height: 1,
      };
    } else if (action === "mouse_move" && coordinate) {
      this.cursorX = Math.max(0, Math.min(this.width - 1, coordinate[0]));
      this.cursorY = Math.max(0, Math.min(this.height - 1, coordinate[1]));
      return {
        simulated: true,
        status: "simulated",
        cursor: [this.cursorX, this.cursorY],
      };
    } else if (
      [
        "left_click",
        "right_click",
        "double_click",
        "triple_click",
        "middle_click",
      ].includes(action)
    ) {
      return {
        simulated: true,
        status: "simulated",
        action,
        cursor: [this.cursorX, this.cursorY],
      };
    } else if (action === "type") {
      return {
        simulated: true,
        status: "simulated",
        characters_simulated: (text || "").length,
      };
    } else if (action === "key") {
      return {
        simulated: true,
        status: "simulated",
        key_simulated: text || "",
      };
    } else if (action === "cursor_position") {
      return { simulated: true, coordinate: [this.cursorX, this.cursorY] };
    }
    return { simulated: true, status: "unsupported_action", action };
  }
}

// Toy keyword rejection demonstrates tool errors, not security or approval.
class ExampleActionFilter {
  public static accepts(input: DesktopActionInput): boolean {
    const text = (input.text || "").toLowerCase();
    if (
      text.includes("rm -rf") ||
      text.includes("sudo") ||
      text.includes(":(){ :|:& };:")
    ) {
      return false;
    }
    return true;
  }
}

async function runComputerUseAgent(goal: string, maxTurns = 5) {
  console.warn(SIMULATOR_WARNING);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY is required.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const desktop = new ComputerUseSimulator(1024, 768, 1);

  const computerTool: Anthropic.Beta.Messages.BetaToolComputerUse20250124 = {
    type: "computer_20250124",
    name: "computer",
    display_width_px: desktop.width,
    display_height_px: desktop.height,
    display_number: desktop.displayNumber,
  };

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    {
      role: "user",
      content:
        "This is a protocol simulator, not a real desktop. All screenshots are a transparent 1x1 placeholder and actions only update in-memory state. Requested demonstration: " +
        goal,
    },
  ];

  let turn = 0;
  while (turn < maxTurns) {
    turn++;
    console.log(`[Turn ${turn}] Invoking Anthropic API...`);

    const response = await client.beta.messages.create({
      model: process.env.MODEL || "claude-3-7-sonnet-20250219",
      max_tokens: 2048,
      tools: [computerTool],
      betas: ["computer-use-2025-01-24"],
      messages,
    });

    console.log(`[Turn ${turn}] Stop reason: ${response.stop_reason}`);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      console.log(
        "Protocol simulation finished; no desktop task was executed.",
      );
      break;
    }

    const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "computer") {
        const input = block.input as DesktopActionInput;
        const action = input.action;

        if (!ExampleActionFilter.accepts(input)) {
          console.warn(`Toy filter rejected simulated action: ${action}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content:
              "SimulatedActionRejected: Toy keyword filter rejected this simulated action. No human approval or security boundary is implemented.",
          });
          continue;
        }

        const result = desktop.executeAction(input);

        if (action === "screenshot") {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: [
              {
                type: "text",
                text: "simulated: true; transparent 1x1 placeholder, not a desktop screenshot",
              },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: result.screenshot_base64 as string,
                },
              },
            ],
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }
      }
    }

    messages.push({ role: "user", content: toolResults });
  }
}

function offlineSmoke() {
  console.warn(SIMULATOR_WARNING);
  const desktop = new ComputerUseSimulator();
  const screenshot = desktop.executeAction({ action: "screenshot" });
  assert.equal(screenshot.simulated, true);
  const png = Buffer.from(screenshot.screenshot_base64 as string, "base64");
  assert.equal(png.readUInt32BE(16), 1);
  assert.equal(png.readUInt32BE(20), 1);
  assert.deepEqual(
    desktop.executeAction({ action: "mouse_move", coordinate: [1024, -1] })
      .cursor,
    [1023, 0],
  );
  for (const action of [
    "left_click",
    "type",
    "key",
    "cursor_position",
    "unsupported",
  ]) {
    assert.equal(
      desktop.executeAction({ action, text: "demonstration only" }).simulated,
      true,
    );
  }
  assert.equal(
    ExampleActionFilter.accepts({ action: "type", text: "sudo rm -rf /" }),
    false,
  );
  console.log(
    "PASS offline Computer Use protocol simulator; no API or desktop interaction",
  );
}

if (process.argv.includes("--offline-smoke")) offlineSmoke();
else {
  const targetGoal =
    process.env.TEST_GOAL ||
    "Demonstrate a screenshot request and cursor movement; no real desktop is available.";
  runComputerUseAgent(targetGoal).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
