const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Create the data folder if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const server = http.createServer((req, res) => {
  // Allow the browser game to talk to this server (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle pre-flight browser requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Handle saving the JSON data
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const pid = data.participantId || 'anon';
        const timestamp = Date.now();
        const filename = `neurodriver_${pid}_${timestamp}.json`;
        const filepath = path.join(DATA_DIR, filename);
        
        // Save the file exactly as it was received!
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`[ SAVED ] 🏁 Successfully saved participant ${pid}'s data -> ${filename}`);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error('[ ERROR ] ❌ Failed to save data:', err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Bad Data' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` 🧠 NEURODRIVER EXPERIMENT SERVER `);
  console.log(`======================================================`);
  console.log(` Listening on port: ${PORT}`);
  console.log(` Target folder: ${DATA_DIR}`);
  console.log(` Keep this terminal window open while middle schoolers play!`);
  console.log(`======================================================\n`);
});
