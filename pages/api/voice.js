import twilio from "twilio";

function buildGather(response, prompt) {
  const gather = response.gather({
    input: "speech",
    action: "/api/process",
    method: "POST",
    speechTimeout: "auto",
  });

  gather.say(prompt);
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method Not Allowed");
  }

  const twiml = new twilio.twiml.VoiceResponse();

  buildGather(
    twiml,
    "Thanks for calling Inside Diagnostics. Can you tell me what you're experiencing?",
  );
  twiml.redirect({ method: "POST" }, "/api/voice");

  res.setHeader("Content-Type", "text/xml");
  res.status(200).send(twiml.toString());
}
