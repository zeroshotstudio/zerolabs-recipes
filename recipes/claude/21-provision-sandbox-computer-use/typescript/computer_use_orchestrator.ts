import Anthropic from "@anthropic-ai/sdk";

// Minimal valid 1x1 transparent PNG base64
const MOCK_SCREENSHOT_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

interface DesktopActionInput {
  action: string;
  coordinate?: [number, number];
  text?: string;
  [key: string]: unknown;
}

class VirtualDesktop {
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
      return { screenshot_base64: MOCK_SCREENSHOT_BASE64 };
    } else if (action === "mouse_move" && coordinate) {
      this.cursorX = Math.max(0, Math.min(this.width, coordinate[0]));
      this.cursorY = Math.max(0, Math.min(this.height, coordinate[1]));
      return { status: "success", cursor: [this.cursorX, this.cursorY] };
    } else if (["left_click", "right_click", "double_click"].includes(action)) {
      return { status: "success", action, cursor: [this.cursorX, this.cursorY] };
    } else if (action === "type" && text) {
      return { status: "success", characters_typed: text.length };
    } else if (action === "key" && text) {
      return { status: "success", key_pressed: text };
    }
    return { status: "unsupported_action", action };
  }
}

class SandboxSecurityGateway {
  public static evaluateSafety(action: string, input: DesktopActionInput): boolean {
    const text = (input.text || "").toLowerCase();
    if (text.includes("rm -rf") || text.includes("sudo") || text.includes(":(){ :|:& };:")) {
      return false;
    }
    return true;
  }
}

async function runComputerUseAgent(goal: string, maxTurns = 5) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("Error: ANTHROPIC_API_KEY is required.");
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  const desktop = new VirtualDesktop(1024, 768, 1);

  const computerTool: Anthropic.Beta.Messages.BetaToolComputerUse20250124 = {
    type: "computer_20250124",
    name: "computer",
    display_width_px: desktop.width,
    display_height_px: desktop.height,
    display_number: desktop.displayNumber,
  };

  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: goal },
  ];

  let turn = 0;
  while (turn < maxTurns) {
    turn++;
    console.log(`[Turn ${turn}] Invoking Anthropic API...`);

    const response = await client.beta.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 2048,
      tools: [computerTool],
      betas: ["computer-use-2025-01-24"],
      messages,
    });

    console.log(`[Turn ${turn}] Stop reason: ${response.stop_reason}`);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      console.log("Agent run completed.");
      break;
    }

    const toolResults: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "computer") {
        const input = block.input as DesktopActionInput;
        const action = input.action;

        if (!SandboxSecurityGateway.evaluateSafety(action, input)) {
          console.warn(`[Security Alert] Action blocked by security gateway: ${action}`);
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: "SecurityPolicyViolation: Action rejected by sandbox safety policy.",
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

const targetGoal = process.env.TEST_GOAL || "Launch browser and navigate to example.com";
runComputerUseAgent(targetGoal).catch(console.error);
