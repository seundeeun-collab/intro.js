import axios from "axios";

const AVAILABLE_MODELS = {
  claudeFable5: { label: "Claude Fable 5", endpoint: process.env.CLAUDE_FABLE5_URL, apiKey: process.env.CLAUDE_FABLE5_KEY },
  claudeMythos5: { label: "Claude Mythos 5", endpoint: process.env.CLAUDE_MYTHOS5_URL, apiKey: process.env.CLAUDE_MYTHOS5_KEY },
  gpt55: { label: "GPT-5.5", endpoint: process.env.GPT55_URL, apiKey: process.env.GPT55_KEY },
  gpt56: { label: "GPT-5.6", endpoint: process.env.GPT56_URL, apiKey: process.env.GPT56_KEY },
  gemini31Pro: { label: "Gemini 3.1 Pro", endpoint: process.env.GEMINI_31_PRO_URL, apiKey: process.env.GEMINI_31_PRO_KEY },
  nemotron3Ultra: { label: "NVIDIA Nemotron 3 Ultra", endpoint: process.env.NEMOTRON_3_ULTRA_URL, apiKey: process.env.NEMOTRON_3_ULTRA_KEY },
  grok4XAI: { label: "Grok4 - xAI", endpoint: process.env.GROK4_XAI_URL, apiKey: process.env.GROK4_XAI_KEY },
  claudeSonnet: { label: "Claude Sonnet", endpoint: process.env.CLAUDE_SONNET_URL, apiKey: process.env.CLAUDE_SONNET_KEY },
  claudeOpus: { label: "Claude Opus", endpoint: process.env.CLAUDE_OPUS_URL, apiKey: process.env.CLAUDE_OPUS_KEY }
};

export function getModelConfig() {
  const configured = Object.entries(AVAILABLE_MODELS)
    .filter(([, model]) => model.endpoint && model.apiKey)
    .map(([key, model]) => ({ key, ...model }));

  if (!configured.length) {
    console.warn("No AI model endpoints configured. AI predictions will be skipped.");
  }

  return configured;
}

export async function queryAiModels(models, prompt) {
  const results = {};

  for (const model of models) {
    try {
      const response = await axios.post(model.endpoint, {
        prompt,
        maxTokens: 800,
        temperature: 0.2
      }, {
        headers: {
          Authorization: `Bearer ${model.apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 60000
      });

      results[model.key] = {
        label: model.label,
        status: "success",
        response: response.data
      };
      console.log(`AI response received from ${model.label}.`);
    } catch (error) {
      console.error(`AI call failed for ${model.label}:`, error.message);
      results[model.key] = {
        label: model.label,
        status: "error",
        error: error.message
      };
    }
  }

  return results;
}
