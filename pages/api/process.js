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
  "You are a premium mold inspection intake assistant.\n\nYou are in an ongoing phone conversation and must remember everything the caller already shared.\n\nYour job is to continue the intake calmly and professionally until the caller's name and property address are collected.\n\nGuide this exact flow without skipping or repeating completed steps:\n1. Issue\n2. Property type\n3. Size\n4. Urgency\n5. Price anchor ($400-$900)\n6. Close\n7. Name\n8. Address\n\nRules:\n- Never repeat questions that were already answered\n- Always ask the NEXT missing step\n- Ask only one question at a time\n- Keep responses under 2 sentences\n- If the caller gives a short or vague answer, ask a brief follow-up that advances the current step\n- Never say you are connecting the caller to a specialist\n- Never suggest ending the call early\n- Never end the conversation before both name and address are collected\n- Sound professional and confident\n- Never diagnose mold\n- Never give remediation advice\n\nRequired wording near the end:\n- After collecting the intake details but before name/address, say: \"A typical inspection ranges between $400 and $900 depending on the scope.\"\n- Then say: \"I can have a specialist reach out, or schedule a visit - what works best for you?\"\n- Then collect the name and address if missing\n- Once both are collected, say exactly: \"Perfect - we'll have someone reach out shortly.\"\n- After that confirmation, if the caller keeps talking, acknowledge briefly and repeat that someone will reach out shortly without restarting intake";

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

  return (
    response.output_text?.trim() ||
    "Could you tell me a bit more so I can keep the intake moving?"
  );
}

function normalizePhoneNumber(phone) {
  const digits = (phone || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if ((phone || "").startsWith("+")) {
    return phone;
  }

  return `+${digits}`;
}

function logTwilioError(context, error) {
  const code = error?.code ? ` code=${error.code}` : "";
  const status = error?.status ? ` status=${error.status}` : "";
  console.error(`[twilio:${context}]${code}${status} ${error?.message || error}`);

  if (error?.code === 21608) {
    console.error(
      "[twilio:sms] Trial accounts can only send SMS to verified numbers. Verify the destination number in Twilio first.",
    );
  }
}

async function sendSms(to, body, context) {
  const normalizedTo = normalizePhoneNumber(to);

  if (
    !normalizedTo ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN ||
    !process.env.TWILIO_PHONE_NUMBER
  ) {
    console.log(`[twilio:${context}] skipped`, {
      hasTo: Boolean(normalizedTo),
      hasAccountSid: Boolean(process.env.TWILIO_ACCOUNT_SID),
      hasAuthToken: Boolean(process.env.TWILIO_AUTH_TOKEN),
      hasFrom: Boolean(process.env.TWILIO_PHONE_NUMBER),
    });
    return;
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: normalizedTo,
    });

    console.log(`[twilio:${context}] sent`, {
      sid: message.sid,
      to: normalizedTo,
    });
  } catch (error) {
    logTwilioError(context, error);
    throw error;
  }
}

async function sendProcessHitSms(from, callSid) {
  if (!process.env.YOUR_PHONE_NUMBER) {
    console.log("[twilio:process-hit] skipped because YOUR_PHONE_NUMBER is not set");
    return;
  }

  try {
    await sendSms(
      process.env.YOUR_PHONE_NUMBER,
      `Process hit for call ${callSid || "unknown"} from ${normalizePhoneNumber(from) || from || "unknown"}.`,
      "process-hit",
    );
  } catch (error) {
    logTwilioError("process-hit", error);
  }
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
    try {
      await sendSms(lead.phone, callerMessage, "caller-confirmation");
      lead.smsSentToCaller = true;
    } catch (error) {
      logTwilioError("caller-confirmation", error);
    }
  }

  if (!lead.smsSentToOwner && process.env.YOUR_PHONE_NUMBER) {
    try {
      await sendSms(
        process.env.YOUR_PHONE_NUMBER,
        ownerMessage,
        "owner-summary",
      );
      lead.smsSentToOwner = true;
    } catch (error) {
      logTwilioError("owner-summary", error);
    }
  }

  lead.completed = lead.smsSentToCaller && lead.smsSentToOwner;
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

    console.log("[process] incoming call", {
      callSid,
      from: normalizePhoneNumber(from) || from,
      speechResult,
    });

    await sendProcessHitSms(from, callSid);

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
    const updatedFromExtraction = updateLead(callSid, extracted);

    console.log("[lead] extracted", {
      callSid,
      name: updatedFromExtraction.name || "",
      address: updatedFromExtraction.address || "",
    });

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
    } else {
      buildGather(twiml, reply);
      twiml.redirect({ method: "POST" }, "/api/voice");
    }

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Error processing Twilio speech input:", error);

    const twiml = new twilio.twiml.VoiceResponse();
    buildGather(
      twiml,
      "I want to make sure I have this right. Could you tell me a bit more about what you're experiencing?",
    );
    twiml.redirect({ method: "POST" }, "/api/voice");

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  }
}
