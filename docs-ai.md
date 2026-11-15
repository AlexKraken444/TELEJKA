# Cloud TELEJKA AI
Set GROQ_API_KEY in the TELEJKA Vercel project and redeploy. Optional GROQ_MODEL defaults to openai/gpt-oss-120b. Never use NEXT_PUBLIC_ for secrets.
No model downloads. AI chat or selected text is sent to Groq, not other chats. Old local-model history remains under its old storage key and is not used as cloud context.
Requests require a session, same-origin check and bounded input. The 6 requests/minute/user limiter is per instance; provider quotas apply globally. Stay on the Free plan with paid billing disabled if charges are unwanted. There is no paid fallback.
Without a valid key the UI reports that AI is not connected. Live model quality is not verified until a key is configured.
