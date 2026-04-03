import bodyParser from "body-parser";
import OpenAI from "openai";
import twilio from "twilio";
import {
  addTurn,
  buildOpenAIInput,
  getConversation,
  getTranscript,
} from "../../lib/memory";
import {
  extractLeadDetails,
  getLead,
  isLeadComplete,
  updateLead,
} from "../../lib/leadStore";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const parseForm = bodyParser.urlencoded({ extended: false });
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN,
);
const SYSTEM_PROMPT =
  "You are a premium mold inspection intake assistant.\n\nYou are in an ongoing phone conversation and must remember everything the caller already shared.\n\nGuide this exact flow without repeating completed steps:\n1. Issue\n2. Property type\n3. Size\n4. Urgency\n5. Price anchor\n6. Close\n7. Collect name\n8. Collect address\n\nRules:\n- Never repeat questions\n- Ask one question at a time\n- Keep responses under 2 sentences\n- Sound professional and confident\n- Never diagnose mold\n- Never give remediation advice\n- If issue is unclear, ask what they are experiencing\n- After enough intake info is collected, say: \"A typical inspection ranges between $400 and $900 depending on the scope.\"\n- Then say: \"I can have a specialist reach out, or schedule a visit - what works best for you?\"\n- Before ending, collect the caller's name and address if missing\n- Once both name and address are collected, say exactly: \"Perfect - we'll have someone reach out shortly.\"\n- After that confirmation, stop asking questions";

function runMiddleware(req, res, middleware) {
  return new Promise((resolve, reject) => {
    middleware(req, res, (result) => {
      if (result instanceof Error) {
        return reject(result);
      }

      return resolve(result);
    });
  });
}

function buildGather(response, prompt) {
  const gather = response.gather({
    input: "speech",
    action: "/api/process",
    method: "POST",
    speechTimeout: "auto",
  });

  gather.say(prompt);
}

async function generateReply(callSid, speechResult) {
  const response = await openai.responses.create({
    model: "gpt-4o-mini",
    input: buildOpenAIInput(callSid, SYSTEM_PROMPT, speechResult),
  });

  return response.output_text?.trim() || "Let me connect you with a specialist.";
}

async function sendSms(to, body) {
  if (
    !to ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    return;
  }

  await twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to,
  });
}

async function sendLeadNotifications(lead, transcript) {
  if (!isLeadComplete(lead) || lead.completed) {
    return lead;
  }

  const callerMessage = `Hi ${lead.name}, we received your request for a mold inspection at ${lead.address}. We'll contact you shortly.`;
  const ownerMessage =
    `New Inside Diagnostics lead\n` +
    `Phone: ${lead.phone || "Unknown"}\n` +
    `Name: ${lead.name}\n` +
    `Address: ${lead.address}\n\n` +
    `Conversation transcript:\n${transcript}`;

  if (!lead.smsSentToCaller) {
    await sendSms(lead.phone, callerMessage);
    lead.smsSentToCaller = true;
  }

  if (!lead.smsSentToOwner && process.env.YOUR_PHONE_NUMBER) {
    await sendSms(process.env.YOUR_PHONE_NUMBER, ownerMessage);
    lead.smsSentToOwner = true;
  }

  lead.completed = true;
  return lead;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  if (
    !process.env.OPENAI_API_KEY ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    return res.status(500).send("Required environment variables are not set");
  }

  try {
    await runMiddleware(req, res, parseForm);

    const speechResult = (req.body?.SpeechResult || "").trim();
    const callSid = req.body?.CallSid || null;
    const from = req.body?.From || "";
    const conversation = getConversation(callSid);
    const lead = getLead(callSid, from);
    const twiml = new twilio.twiml.VoiceResponse();

    if (!speechResult) {
      buildGather(
        twiml,
        "I didn't catch that clearly. Can you tell me what you're experiencing?",
      );
      twiml.redirect({ method: "POST" }, "/api/voice");
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(twiml.toString());
    }

    const lastAssistantMessage =
      conversation.turns
        .filter((turn) => turn.role === "assistant")
        .at(-1)?.text || "";
    const extracted = extractLeadDetails({
      lead,
      speechResult,
      lastAssistantMessage,
    });

    addTurn(callSid, "user", speechResult);
    updateLead(callSid, extracted);

    const reply = await generateReply(callSid, speechResult);

    addTurn(callSid, "assistant", reply);

    const transcript = getTranscript(callSid);
    const updatedLead = updateLead(callSid, {
      phone: from || lead.phone,
      summary: transcript,
    });

    const shouldFinish =
      isLeadComplete(updatedLead) &&
      /we'll have someone reach out shortly/i.test(reply);

    if (shouldFinish) {
      await sendLeadNotifications(updatedLead, transcript);
      twiml.say(reply);
      twiml.hangup();
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(twiml.toString());
    }

    buildGather(twiml, reply);
    twiml.redirect({ method: "POST" }, "/api/voice");

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Error processing Twilio speech input:", error);

    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say("Let me connect you with a specialist.");
    twiml.hangup();

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  }
}
