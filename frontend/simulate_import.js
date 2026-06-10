import * as fs from 'fs';

const logPath = 'C:/Users/tsebm/.gemini/antigravity-ide/brain/0722cfeb-e2e9-43c2-81f3-4c52c8673779/.system_generated/logs/transcript.jsonl';

if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, 'utf8');
    const lines = content.split('\n');
    const data = JSON.parse(lines[573]);
    console.log(data.content);
} else {
    console.log("Log file NOT found");
}
