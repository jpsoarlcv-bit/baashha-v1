export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({error:'POST only'}),
        {status:405,headers:{
          'Content-Type':'application/json',
          'Access-Control-Allow-Origin':'*'
        }}
      );
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Route 1: Translation
    if (path === '/' || path === '/translate') {
      try {
        const {text, targetLanguage} =
          await request.json();

        const r = await fetch(
          'https://generativelanguage.googleapis.com'
          +'/v1beta/models/gemini-2.5-flash'
          +':generateContent?key=' + env.GEMINI_KEY,
          {
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              contents:[{parts:[{
                text:'Translate to '
                  +targetLanguage
                  +'. Return translation only: '
                  +text
              }]}],
              generationConfig:{
                temperature:0.1,
                maxOutputTokens:2048
              }
            })
          }
        );

        const d = await r.json();

        if (!d.candidates?.length) {
          return new Response(
            JSON.stringify({
              error:'No candidates',
              debug:d
            }),
            {status:500,headers:{
              'Content-Type':'application/json',
              'Access-Control-Allow-Origin':'*'
            }}
          );
        }

        const translation = d.candidates[0]
          .content.parts[0].text.trim();

        return new Response(
          JSON.stringify({translation}),
          {headers:{
            'Content-Type':'application/json',
            'Access-Control-Allow-Origin':'*'
          }}
        );

      } catch(err) {
        return new Response(
          JSON.stringify({error:err.message}),
          {status:500,headers:{
            'Content-Type':'application/json',
            'Access-Control-Allow-Origin':'*'
          }}
        );
      }
    }

    // Route 2: Transcription via OpenAI Whisper
    if (path === '/transcribe') {
      try {
        const body = await request.json();
        const {audioBase64, languageCode} = body;

        // Convert base64 to binary
        const binaryStr = atob(audioBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for(let i=0; i<binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: 'audio/mp4' });

        // Whisper uses ISO-639-1 (e.g., 'hi' instead of 'hi-IN')
        let langCode = 'hi';
        if (languageCode && languageCode.length >= 2) {
          langCode = languageCode.substring(0, 2);
        }

        const formData = new FormData();
        formData.append('model', 'whisper-1');
        formData.append('language', langCode);
        formData.append('file', blob, 'audio.mp4');

        const whisperResponse = await fetch(
          'https://api.openai.com/v1/audio/transcriptions',
          {
            method:'POST',
            headers:{
              'Authorization': 'Bearer ' + env.OPENAI_API_KEY
            },
            body: formData
          }
        );

        if (!whisperResponse.ok) {
          const errText =
            await whisperResponse.text();
          throw new Error(
            'Whisper failed: '+errText
          );
        }

        const whisperData =
          await whisperResponse.json();

        return new Response(
          JSON.stringify({
            transcript: whisperData.text || ''
          }),
          {headers:{
            'Content-Type':'application/json',
            'Access-Control-Allow-Origin':'*'
          }}
        );

      } catch(err) {
        return new Response(
          JSON.stringify({error:err.message}),
          {status:500,headers:{
            'Content-Type':'application/json',
            'Access-Control-Allow-Origin':'*'
          }}
        );
      }
    }

    return new Response(
      JSON.stringify({error:'Unknown route'}),
      {status:404,headers:{
        'Content-Type':'application/json',
        'Access-Control-Allow-Origin':'*'
      }}
    );
  }
}
