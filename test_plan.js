import { getPlanOnly } from './agent.js';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing AI Planning...");
    try {
        const result = await getPlanOnly("Search for weather in NY");
        console.log("RESULT:", JSON.stringify(result, null, 2));
    } catch (e) {
        console.error("ERROR:", e);
    }
}
test();
