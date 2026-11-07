const modelName = "gemini-3.1-flash-lite";

export async function askGemini(env, instruction, input, schema) {
  if (!env.GEMINI_API_KEY) return null;
  const model = env.GEMINI_MODEL || modelName;
  if (!/^[a-z0-9][a-z0-9.-]{0,79}$/.test(model)) return null;
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        signal: AbortSignal.timeout(6500),
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: instruction }] },
          contents: [{ parts: [{ text: JSON.stringify(input) }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: schema,
            maxOutputTokens: 500,
            temperature: 0.2,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
      },
    );
    if (!response.ok) return null;
    const data = await response.json();
    return JSON.parse(
      data.candidates?.[0]?.content?.parts?.find(
        (part) => part.text && !part.thought,
      )?.text || "null",
    );
  } catch {
    return null;
  }
}

// Send only standard playbook topics. Workspace names, counts, notes,
// addresses and the user's original question stay in the application.
export async function suggestedNextSteps(env, findings, topic) {
  const labels = {
    offers: "Defining an offer",
    icps: "Identifying ideal customers",
    deals: "Following up with open opportunities",
    tasks: "Prioritizing overdue follow-ups",
    contacts: "Obtaining permission to email contacts",
  };
  const topics = [
    ...new Set(
      findings.map((finding) => labels[finding.source]).filter(Boolean),
    ),
  ];
  if (!topics.length) return [];
  const output = await askGemini(
    env,
    "Write up to three practical B2B sales next steps for these standard playbook topics. Give no factual claims about the user's business, and do not suggest sending unsolicited email.",
    { topics, focus: labels[topic] || "Highest priority first" },
    {
      type: "object",
      properties: { steps: { type: "array", items: { type: "string" } } },
      required: ["steps"],
    },
  );
  return Array.isArray(output?.steps)
    ? output.steps
        .filter((step) => typeof step === "string" && step.trim())
        .slice(0, 3)
        .map((step) => step.slice(0, 280))
    : [];
}
