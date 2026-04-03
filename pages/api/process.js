import bodyParser from "body-parser";
import OpenAI from "openai";
import twilio from "twilio";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const parseForm = bodyParser.urlencoded({ extended: false });

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

async function generateReply(speechResult) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: [
          {
            type: "input_text",
            text:
              "You are a professional mold inspection intake assistant.\n- Ask one question at a time\n- Keep responses under 2 sentences\n- Be confident and professional\n- Move toward booking an inspection\n- Do NOT give remediation advice",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: speechResult,
          },
        ],
      },
    ],
  });

  return (
    response.output_text?.trim() ||
    "I can help with that. What address should we use for the inspection?"
  );
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

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).send("OPENAI_API_KEY is not set");
  }

  try {
    await runMiddleware(req, res, parseForm);

    const speechResult = (req.body?.SpeechResult || "").trim();
    const twiml = new twilio.twiml.VoiceResponse();

    if (!speechResult) {
      buildGather(
        twiml,
        "I didn't catch that. Please tell me what issue you're calling about.",
      );
      twiml.redirect({ method: "POST" }, "/api/voice");
      res.setHeader("Content-Type", "text/xml");
      return res.status(200).send(twiml.toString());
    }

    const reply = await generateReply(speechResult);

    buildGather(twiml, reply);
    twiml.redirect({ method: "POST" }, "/api/voice");

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  } catch (error) {
    console.error("Error processing Twilio speech input:", error);

    const twiml = new twilio.twiml.VoiceResponse();
    buildGather(
      twiml,
      "I'm sorry, something went wrong. Please briefly describe the issue again.",
    );
    twiml.redirect({ method: "POST" }, "/api/voice");

    res.setHeader("Content-Type", "text/xml");
    return res.status(200).send(twiml.toString());
  }
}
