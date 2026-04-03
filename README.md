# Twilio Voice AI Intake for Next.js

This project is a production-ready AI phone intake system for Inside Diagnostics built with Next.js API routes, Twilio Voice, Twilio SMS, and OpenAI.

## Requirements

- A Twilio phone number with Voice enabled
- A Twilio account that can send SMS
- An OpenAI API key
- Node.js 18+

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Add your environment variables to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
YOUR_PHONE_NUMBER=your_cell_number
```

3. Start the app:

```bash
npm run dev
```

## API routes

- `POST /api/voice`
  Returns TwiML that asks: "Thanks for calling Inside Diagnostics. Can you tell me what you're experiencing?"

- `POST /api/process`
  Accepts Twilio's form-urlencoded webhook, processes `SpeechResult`, `CallSid`, and `From`, sends the conversation to OpenAI, stores lead data, and continues the call.

## Conversation flow

The assistant guides this structured intake:
- issue
- property type
- affected area size
- urgency
- price anchor
- close
- name
- address

The system remembers the conversation per `CallSid`, avoids repeating questions, and stores a per-call lead object in memory.

## Lead handling

For each call, the system stores:
- caller phone number
- caller name
- property address
- full conversation transcript

When name and address are collected:
- the caller receives a confirmation SMS
- the business owner receives an SMS summary with the transcript

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. In the Vercel project settings, add these environment variables:

```bash
OPENAI_API_KEY=your_openai_api_key
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_number
YOUR_PHONE_NUMBER=your_cell_number
```

4. Deploy the project.

## Configure Twilio webhook

After deployment, copy your production voice webhook URL:

```text
https://your-vercel-domain.vercel.app/api/voice
```

In Twilio:

1. Open your phone number settings.
2. Under Voice Configuration, set the incoming call webhook for `A CALL COMES IN`.
3. Paste the Vercel URL above.
4. Set the method to `HTTP POST`.
5. Save the number settings.

## How to test

1. Make sure all five environment variables are set in Vercel.
2. Call your Twilio number.
3. Speak naturally through the intake flow.
4. Provide your name and street address near the end of the call.
5. Confirm that:
   - the caller receives a confirmation SMS
   - the business owner receives the lead summary SMS

## Notes

- This app uses the Next.js Pages Router with API routes only.
- Twilio webhooks are handled as `application/x-www-form-urlencoded`.
- In-memory conversation and lead storage are simple and serverless-friendly, but not durable across cold starts. If you want persistent multi-instance memory later, move these stores to Redis or a database.
