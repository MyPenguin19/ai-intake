import bodyParser from "body-parser";
import OpenAI from "openai";
import twilio from "twilio";
import { addTurn, getTranscript } from "../../lib/memory";
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
const ACK_SYSTEM_PROMPT =
  "You write short, calm, professional acknowledgement lines for a premium mold inspection phone intake agent. Return one sentence only, no questions, no diagnosis, no remediation advice, and no transfer language.";
const callStates = new Map();

function getCallState(callSid) {
  if (!callSid) {
    return {
      step: "issue",
      updatedAt: Date.now(),
    };
  }

  const existing = callStates.get(callSid);

  if (existing) {
    existing.updatedAt = Date.now();
    return existing;
  }

  const created = {
    step: "issue",
    updatedAt: Date.now(),
  };

  callStates.set(callSid, created);
  return created;
}

function setCallStep(callSid, nextStep) {
  const state = getCallState(callSid);
  const previousStep = state.step;

  state.step = nextStep;
  state.updatedAt = Date.now();

  console.log("[flow] step change", {
    callSid,
    from: previousStep,
    to: nextStep,
  });

  return state;
}

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

async function generateAcknowledgement(step, speechResult) {
  try {
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: ACK_SYSTEM_PROMPT,
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Current intake step: ${step}. Caller said: "${speechResult}".`,
            },
          ],
        },
      ],
    });

    return response.output_text?.trim() || "";
  } catch (error) {
    console.error("[openai] acknowledgement failed", error?.message || error);
    return "";
  }
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
    return false;
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

    return true;
  } catch (error) {
    logTwilioError(context, error);
    return false;
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
    lead.smsSentToCaller = await sendSms(
      lead.phone,
      callerMessage,
      "caller-confirmation",
    );
  }

  if (!lead.smsSentToOwner && process.env.YOUR_PHONE_NUMBER) {
    lead.smsSentToOwner = await sendSms(
      process.env.YOUR_PHONE_NUMBER,
      ownerMessage,
      "owner-summary",
    );
  }

  lead.completed = lead.smsSentToCaller && lead.smsSentToOwner;

  console.log("[sms] lead notification status", {
    callerSent: lead.smsSentToCaller,
    ownerSent: lead.smsSentToOwner,
    completed: lead.completed,
  });

  return lead;
}

function questionForStep(step) {
  switch (step) {
    case "issue":
      return "Can you tell me what you're experiencing?";
    case "property":
      return "Is this a house, apartment, or commercial property?";
    case "size":
      return "About how large is the affected area?";
    case "urgency":
      return "When did you first notice this, and is it something that needs attention right away?";
    case "close":
      return "I can have a specialist reach out, or schedule a visit - what works best for you?";
    case "name":
      return "Can I get your name for the inspection?";
    case "address":
      return "What's the address where this is needed?";
    default:
      return "Can you tell me a bit more?";
  }
}

function buildNoSpeechPrompt(step) {
  return `I didn't catch that clearly. ${questionForStep(step)}`;
}

function isValidName(value) {
  const words = value
    .trim()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter(Boolean);

  return (
    words.length >= 1 &&
    words.length <= 3 &&
    words.every((word) => /^[A-Za-z'-]+$/.test(word))
  );
}

function isValidAddress(value) {
  return (
    /\d/.test(value) &&
    /(street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|place|pl|trail|trl|circle|cir|parkway|pkwy|highway|hwy|unit|apt|suite|ste)\b/i.test(
      value,
    )
  );
}

function composeReply(acknowledgement, prompt) {
  return [acknowledgement, prompt].filter(Boolean).join(" ").trim();
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
    const state = getCallState(callSid);
    const lead = getLead(callSid, from);
    const twiml = new twilio.twiml.VoiceResponse();

    console.log("[process] incoming call", {
      callSid,
      from: normalizePhoneNumber(from) || from,
      step: state.step,
      speechResult,
    });

    if (!speechResult) {
      buildGather(twiml, buildNoSpeechPrompt(state.step));
      twiml.redirect({ method: "POST" }, "/api/voice");
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(twiml.toString());
    }

    const extracted = extractLeadDetails({
      lead,
      speechResult,
      lastAssistantMessage: questionForStep(state.step),
    });

    addTurn(callSid, "user", speechResult);

    const updatedFromExtraction = updateLead(callSid, {
      phone: from || lead.phone,
      ...extracted,
    });

    console.log("[lead] extracted", {
      callSid,
      name: updatedFromExtraction.name || "",
      address: updatedFromExtraction.address || "",
    });

    let nextStep = state.step;
    let prompt = "";

    switch (state.step) {
      case "issue":
        updateLead(callSid, { issue: speechResult });
        nextStep = "property";
        prompt = questionForStep(nextStep);
        break;
      case "property":
        updateLead(callSid, { propertyType: speechResult });
        nextStep = "size";
        prompt = questionForStep(nextStep);
        break;
      case "size":
        updateLead(callSid, { size: speechResult });
        nextStep = "urgency";
        prompt = questionForStep(nextStep);
        break;
      case "urgency":
        updateLead(callSid, { urgency: speechResult });
        nextStep = "close";
        prompt =
          "A typical inspection ranges between $400 and $900 depending on the scope. " +
          questionForStep("close");
        break;
      case "price":
        nextStep = "close";
        prompt =
          "A typical inspection ranges between $400 and $900 depending on the scope. " +
          questionForStep("close");
        break;
      case "close":
        updateLead(callSid, { closePreference: speechResult });
        nextStep = updatedFromExtraction.name ? "address" : "name";
        prompt = questionForStep(nextStep);
        break;
      case "name":
        if (!updatedFromExtraction.name && !isValidName(speechResult)) {
          nextStep = "name";
          prompt = questionForStep("name");
          break;
        }

        if (!updatedFromExtraction.name) {
          updateLead(callSid, { name: speechResult.trim() });
        }

        nextStep = updatedFromExtraction.address ? "done" : "address";
        prompt =
          nextStep === "done"
            ? "Perfect - we'll have someone reach out shortly."
            : questionForStep("address");
        break;
      case "address":
        if (!updatedFromExtraction.address && !isValidAddress(speechResult)) {
          nextStep = "address";
          prompt = questionForStep("address");
          break;
        }

        if (!updatedFromExtraction.address) {
          updateLead(callSid, { address: speechResult.trim() });
        }

        nextStep = "done";
        prompt = "Perfect - we'll have someone reach out shortly.";
        break;
      case "done":
      default:
        nextStep = "done";
        prompt = "Perfect - we'll have someone reach out shortly.";
        break;
    }

    const acknowledgement =
      nextStep === "done" ||
      nextStep === "close" ||
      nextStep === "name" ||
      nextStep === "address"
        ? ""
        : await generateAcknowledgement(state.step, speechResult);
    const reply = composeReply(acknowledgement, prompt);

    addTurn(callSid, "assistant", reply);

    const transcript = getTranscript(callSid);
    const updatedLead = updateLead(callSid, {
      phone: from || lead.phone,
      summary: transcript,
    });

    setCallStep(callSid, nextStep);

    if (nextStep === "done" && isLeadComplete(updatedLead)) {
      await sendLeadNotifications(updatedLead, transcript);
      twiml.say(reply);
      twiml.hangup();
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
