import fs from 'fs';

async function analyze() {
  const img = fs.readFileSync('/home/z/my-project/upload/pasted_image_1775212743919.png');
  const b64 = img.toString('base64');

  const payload = {
    model: 'default',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe exactly what is shown in this screenshot. Focus on: 1) What error messages are visible? 2) What is the UI showing? 3) Is this a mobile app or web app? 4) What specific error text can you read? List every visible error, warning, or problem.' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${b64}` } }
        ]
      }
    ]
  };

  const response = await fetch('http://172.25.136.193:8080/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Token': 'Z.ai'
    },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  try {
    const data = JSON.parse(text);
    if (data.choices) {
      console.log(data.choices[0]?.message?.content);
    } else {
      console.log('Response:', text.substring(0, 500));
    }
  } catch(e) {
    console.log('Raw response (' + text.length + ' chars):', text.substring(0, 500));
  }
}

analyze().catch(err => console.error('Error:', err.message));
