/* ============================================
   NETLIFY SERVERLESS FUNCTION — GEMINI PROXY
   API key stays on server, never exposed
   ============================================ */

exports.handler = async (event) => {

  /* ---- Only allow POST ---- */
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  /* ---- CORS headers ---- */
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const { messages, systemPrompt } = JSON.parse(event.body);

    if (!messages || !Array.isArray(messages)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid request body' }),
      };
    }

    /* ---- Get API key from environment variable ---- */
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }

    /* ---- Call Gemini API ---- */
    const geminiURL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiURL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents: messages,
        generationConfig: {
          maxOutputTokens: 500,
          temperature:     0.7,
        },
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: `Gemini API error: ${response.status}`,
          details: errData,
        }),
      };
    }

    const data  = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ reply }),
    };

  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};