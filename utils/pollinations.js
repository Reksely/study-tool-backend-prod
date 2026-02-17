/* 
Pollinations AI used to be fully free at time of writing this code. Now it is partly.

Reference https://enter.pollinations.ai/ and https://enter.pollinations.ai/api/docs to update 
with your own API key.

Set POLLINATIONS_API_KEY environment variable with your API key.
*/

const axios = require('axios');

// Get API key from environment variable
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || '';

/**
 * Send messages to Pollinations AI API using new API format
 * @param {Array} messages - Array of message objects with role and content
 * @param {number} retryCount - Number of retries on failure
 * @param {string} model - Model to use (default: 'openai')
 * @returns {Promise<string>} - The AI response text
 */
async function sendPollinationsMessages(messages, retryCount = 3, model = 'openai') {
    let attempts = 0;
    
    // Extract system and user messages
    let systemPrompt = '';
    let userPrompt = '';
    
    for (const msg of messages) {
        if (msg.role === 'system') {
            systemPrompt = msg.content;
        } else if (msg.role === 'user') {
            userPrompt = msg.content;
        } else if (msg.role === 'assistant') {
            // For chat history, append to user prompt
            userPrompt += `\n\nAssistant: ${msg.content}`;
        }
    }
    
    // Combine system and user prompts for the new API format
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    
    while (attempts < retryCount) {
        try {
            attempts++;
            console.log(`Generating text with Pollinations AI, attempt ${attempts}/${retryCount}...`);
            
            // URL encode the prompt
            const encodedPrompt = encodeURIComponent(fullPrompt);
            const apiEndpoint = `https://gen.pollinations.ai/text/${encodedPrompt}`;
            
            const headers = {};
            if (POLLINATIONS_API_KEY) {
                headers['Authorization'] = `Bearer ${POLLINATIONS_API_KEY}`;
            }
            
            const response = await axios.get(apiEndpoint, {
                headers,
                params: {
                    model: model,
                    json: false,
                    stream: false
                },
                timeout: 300000 // 5 minutes
            });
            
            console.log('Text generation completed successfully!');
            
            // The new API returns plain text directly
            if (typeof response.data === 'string') {
                let content = response.data.trim();
                // Clean up any special tokens
                content = content
                    .replace(/<\|.*?\|>[a-zA-Z0-9_]*?(?=<\||$)/g, '')
                    .replace(/<\|.*?\|>/g, '')
                    .trim();
                return content;
            }
            
            throw new Error(`Unexpected response format: ${JSON.stringify(response.data)}`);
            
        } catch (error) {
            console.error(`Attempt ${attempts}/${retryCount} failed:`, error.message);
            if (error.response) {
                console.error("Response status:", error.response.status);
                console.error("Response data:", JSON.stringify(error.response.data, null, 2));
            }
            
            if (attempts === retryCount) {
                throw new Error(`Failed to generate text after ${retryCount} attempts: ${error.message}`);
            }
            
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Stream a message using Pollinations AI (new API)
 * @param {string} fullPrompt - The complete prompt to send
 * @param {Object} res - Express response object for streaming
 * @param {string} model - Model to use (default: 'openai')
 * @returns {Promise<string>} - The complete response text
 */
async function streamPollinationsMessage(fullPrompt, res, model = 'openai') {
    try {
        // URL encode the prompt
        const encodedPrompt = encodeURIComponent(fullPrompt);
        const apiEndpoint = `https://gen.pollinations.ai/text/${encodedPrompt}`;
        
        const headers = {};
        if (POLLINATIONS_API_KEY) {
            headers['Authorization'] = `Bearer ${POLLINATIONS_API_KEY}`;
        }
        
        const response = await axios.get(apiEndpoint, {
            headers,
            params: {
                model: model,
                stream: true
            },
            timeout: 300000,
            responseType: 'stream'
        });

        let fullContent = '';
        
        return new Promise((resolve, reject) => {
            response.data.on('data', (chunk) => {
                const chunkStr = chunk.toString();
                fullContent += chunkStr;
                // Send the chunk to the client
                res.write(`data: ${JSON.stringify({ content: chunkStr })}\n\n`);
            });

            response.data.on('end', () => {
                res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
                res.end();
                resolve(fullContent);
            });

            response.data.on('error', (err) => {
                console.error('Stream error:', err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
                reject(err);
            });
        });
    } catch (error) {
        console.error('Stream request error:', error);
        throw error;
    }
}

module.exports = {
    sendPollinationsMessages,
    streamPollinationsMessage
};
