# Twilio Voice AI Intake for Next.js

This is a minimal Next.js app that answers Twilio voice calls, collects speech input, sends the caller's words to OpenAI, speaks the reply back, and keeps the call moving with a speech loop.

## Requirements

- A Twilio phone number with Voice enabled
- An OpenAI API key
- Node.js 18+

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Add your API key to `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key
```

3. Start the app:

```bash
npm run dev
```

## API routes

- `POST /api/voice`
  Returns TwiML that asks: "Thanks for calling Inside Diagnostics. What seems to be the issue?"

- `POST /api/process`
  Accepts Twilio's `SpeechResult`, sends it to OpenAI, speaks the reply, and starts another speech gather.

## Deploy to Vercel

1. Push this project to GitHub.
2. Import the repository into Vercel.
3. In the Vercel project settings, add this environment variable:

```bash
OPENAI_API_KEY=your_openai_api_key
```

4. Deploy the project.

## Configure Twilio webhook

After deployment, copy your production voice webhook URL:

```text
https://your-vercel-domain.vercel.app/api/voice
```

In Twilio:

1. Open your phone number settings.
2. Under Voice Configuration, set the incoming call webhook to `A CALL COMES IN`.
3. Paste the Vercel URL above.
4. Set the method to `HTTP POST`.
5. Save the number settings.

## Notes

- This app is built with the Next.js Pages Router and API routes only.
- Twilio sends webhook payloads as `application/x-www-form-urlencoded`, so `/api/process` uses URL-encoded body parsing explicitly.
- The OpenAI assistant is kept intentionally short, professional, and focused on moving the call toward booking an inspection.
