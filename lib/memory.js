const conversations = new Map();
const MAX_TURNS = 16;

function createConversation() {
  return {
    turns: [],
    updatedAt: Date.now(),
  };
}

export function getConversation(callSid) {
  if (!callSid) {
    return createConversation();
  }

  const existing = conversations.get(callSid);

  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created = createConversation();
  conversations.set(callSid, created);
  return created;
}

export function addTurn(callSid, role, text) {
  const conversation = getConversation(callSid);

  conversation.turns.push({ role, text });

  if (conversation.turns.length > MAX_TURNS) {
    conversation.turns = conversation.turns.slice(-MAX_TURNS);
  }

  conversation.updatedAt = Date.now();
  return conversation;
}

export function getTranscript(callSid) {
  const conversation = getConversation(callSid);

  return conversation.turns
    .map((turn) => `${turn.role === "assistant" ? "Assistant" : "Caller"}: ${turn.text}`)
    .join("\n");
}

export function buildOpenAIInput(callSid, systemPrompt, latestUserMessage) {
  const conversation = getConversation(callSid);
  const input = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: systemPrompt,
        },
      ],
    },
  ];

  for (const turn of conversation.turns) {
    input.push({
      role: turn.role,
      content: [
        {
          type: "input_text",
          text: turn.text,
        },
      ],
    });
  }

  input.push({
    role: "user",
    content: [
      {
        type: "input_text",
        text: latestUserMessage,
      },
    ],
  });

  return input;
}
